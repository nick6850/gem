import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const YOUTUBE_FIXTURE_URL = "https://www.youtube.com/tests/fixtures/youtube.html";

async function installExtensionMocks(page: Page): Promise<void> {
  await page.addInitScript(() => {
    globalThis.GEM_CONFIG = {
      defaultProvider: "openai",
      openai: {
        apiKey: "test-openai-key",
      },
    };

    const stored = JSON.parse(localStorage.getItem("__mockChromeStorage") || "{}");
    localStorage.setItem(
      "__mockChromeStorage",
      JSON.stringify({ ...stored, lightContextEnabled: false })
    );

    (globalThis as unknown as { chrome: unknown }).chrome = {
      runtime: {
        getURL(path: string) {
          return `https://www.youtube.com/${path}`;
        },
        sendMessage() {},
        onMessage: {
          addListener() {},
        },
      },
      storage: {
        local: {
          get(key: string, callback: (result: Record<string, unknown>) => void) {
            const data = JSON.parse(localStorage.getItem("__mockChromeStorage") || "{}");
            callback({ [key]: data[key] });
          },
          set(items: Record<string, unknown>, callback?: () => void) {
            const data = JSON.parse(localStorage.getItem("__mockChromeStorage") || "{}");
            localStorage.setItem("__mockChromeStorage", JSON.stringify({ ...data, ...items }));
            callback?.();
          },
        },
      },
    };
  });
}

async function routeYouTubeFixture(page: Page): Promise<void> {
  const [fixtureHtml, contentBundle, bridgeBundle] = await Promise.all([
    readFile("tests/fixtures/youtube.html", "utf8"),
    readFile("dist/content.js", "utf8"),
    readFile("dist/youtube-bridge.js", "utf8"),
  ]);

  await page.route(YOUTUBE_FIXTURE_URL, async (route) => {
    await route.fulfill({
      body: fixtureHtml,
      contentType: "text/html",
    });
  });

  await page.route("https://www.youtube.com/dist/content.js", async (route) => {
    await route.fulfill({
      body: contentBundle,
      contentType: "application/javascript",
    });
  });

  await page.route("https://www.youtube.com/dist/youtube-bridge.js", async (route) => {
    await route.fulfill({
      body: bridgeBundle,
      contentType: "application/javascript",
    });
  });
}

async function loadYouTubeFixture(page: Page): Promise<void> {
  await installExtensionMocks(page);
  await routeYouTubeFixture(page);

  await page.goto(YOUTUBE_FIXTURE_URL);
  await expect(page.locator("#my-ai-helper-host")).toHaveCount(1);
}

test.describe("YouTube subtitle integration", () => {
  test("keeps old caption pointer and cursor rules", async ({ page }) => {
    await loadYouTubeFixture(page);

    const styles = await page.evaluate(() => {
      const container = document.querySelector(".ytp-caption-window-container");
      const segment = document.querySelector(".ytp-caption-segment");
      const text = document.querySelector(".ytp-caption-text");
      if (!(container instanceof HTMLElement) || !(segment instanceof HTMLElement) || !(text instanceof HTMLElement)) {
        throw new Error("Caption fixture is incomplete");
      }

      const containerStyle = getComputedStyle(container);
      const segmentStyle = getComputedStyle(segment);
      const textStyle = getComputedStyle(text);

      return {
        containerPointerEvents: containerStyle.pointerEvents,
        containerCursor: containerStyle.cursor,
        segmentPointerEvents: segmentStyle.pointerEvents,
        segmentCursor: segmentStyle.cursor,
        textPointerEvents: textStyle.pointerEvents,
        textCursor: textStyle.cursor,
      };
    });

    expect(styles).toEqual({
      containerPointerEvents: "none",
      containerCursor: "text",
      segmentPointerEvents: "auto",
      segmentCursor: "text",
      textPointerEvents: "auto",
      textCursor: "text",
    });
  });

  test("keeps dynamically added caption nodes selectable without broad parent cursor overrides", async ({ page }) => {
    await loadYouTubeFixture(page);

    const result = await page.evaluate(async () => {
      const wrapper = document.createElement("div");
      wrapper.className = "unrelated-wrapper";
      document.body.appendChild(wrapper);

      const dynamicSegment = document.createElement("span");
      dynamicSegment.className = "ytp-caption-segment";
      dynamicSegment.textContent = "Dynamic caption";
      wrapper.appendChild(dynamicSegment);

      await new Promise((resolve) => requestAnimationFrame(resolve));

      return {
        wrapperInlineCursor: wrapper.style.cursor,
        wrapperInlinePointerEvents: wrapper.style.pointerEvents,
        dynamicSegmentInlineUserSelect: dynamicSegment.style.userSelect,
        dynamicSegmentInlinePointerEvents: dynamicSegment.style.pointerEvents,
      };
    });

    expect(result).toEqual({
      wrapperInlineCursor: "",
      wrapperInlinePointerEvents: "",
      dynamicSegmentInlineUserSelect: "text",
      dynamicSegmentInlinePointerEvents: "auto",
    });
  });

  test("lets the browser handle right-clicks on subtitles instead of the YouTube player", async ({ page }) => {
    await loadYouTubeFixture(page);

    const result = await page.evaluate(() => {
      const player = document.querySelector(".html5-video-player");
      const captionText = document.querySelector(".ytp-caption-text");
      if (!(player instanceof HTMLElement) || !(captionText instanceof HTMLElement)) {
        throw new Error("Caption fixture is incomplete");
      }

      let youtubeMenuOpened = false;
      player.addEventListener("contextmenu", (event) => {
        youtubeMenuOpened = true;
        event.preventDefault();
      });

      const contextMenuEvent = new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        button: 2,
      });
      const nativeMenuAllowed = captionText.dispatchEvent(contextMenuEvent);

      return { nativeMenuAllowed, youtubeMenuOpened };
    });

    expect(result).toEqual({
      nativeMenuAllowed: true,
      youtubeMenuOpened: false,
    });
  });

  test("uses the caption track actually selected in the YouTube player", async ({ page }) => {
    const captionRequests: string[] = [];
    let openAIRequest: Record<string, unknown> | null = null;

    await page.route("https://www.youtube.com/api/timedtext**", async (route) => {
      const url = new URL(route.request().url());
      captionRequests.push(url.toString());
      const language = url.searchParams.get("lang");
      const events = language === "es"
        ? [
            { tStartMs: 80000, dDurationMs: 3000, segs: [{ utf8: "contexto anterior" }] },
            { tStartMs: 118000, dDurationMs: 4000, segs: [{ utf8: "texto seleccionado" }] },
            { tStartMs: 124000, dDurationMs: 3000, segs: [{ utf8: "contexto posterior" }] },
          ]
        : [{ tStartMs: 118000, dDurationMs: 4000, segs: [{ utf8: "wrong English track" }] }];
      await route.fulfill({ body: JSON.stringify({ events }), contentType: "application/json" });
    });
    await page.route("https://api.openai.com/v1/responses", async (route) => {
      openAIRequest = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        body: JSON.stringify({ output_text: "Definición clara." }),
        contentType: "application/json",
      });
    });

    await loadYouTubeFixture(page);
    await expect.poll(() => page.evaluate(() =>
      document.querySelector("#my-ai-helper-host")?.shadowRoot
        ?.querySelector(".context-toggle")?.getAttribute("aria-checked")
    )).toBe("false");

    await page.evaluate(() => {
      const player = document.querySelector("#movie_player") as HTMLElement & {
        getPlayerResponse?: () => unknown;
        getOption?: () => unknown;
        getCurrentTime?: () => number;
      };
      const captionText = document.querySelector(".ytp-caption-text");
      if (!player || !captionText) throw new Error("Caption fixture is incomplete");
      captionText.textContent = "texto seleccionado";
      player.getCurrentTime = () => 120;
      player.getOption = () => ({
        languageCode: "es",
        vss_id: ".es",
        kind: "",
        name: { simpleText: "Spanish" },
      });
      player.getPlayerResponse = () => ({
        videoDetails: { videoId: "selected123", title: "Multi track video" },
        captions: {
          playerCaptionsTracklistRenderer: {
            captionTracks: [
              {
                baseUrl: "https://www.youtube.com/api/timedtext?v=selected123&lang=en",
                languageCode: "en",
                vssId: ".en",
                name: { simpleText: "English" },
              },
              {
                baseUrl: "https://www.youtube.com/api/timedtext?v=selected123&lang=es",
                languageCode: "es",
                vssId: ".es",
                name: { simpleText: "Spanish" },
              },
            ],
          },
        },
      });

      const textNode = captionText.firstChild;
      if (!textNode?.textContent) throw new Error("Caption text is missing");
      const range = document.createRange();
      range.selectNodeContents(textNode);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
      window.dispatchEvent(new KeyboardEvent("keydown", {
        key: "z",
        code: "KeyZ",
        metaKey: true,
        bubbles: true,
        cancelable: true,
      }));
    });

    await expect.poll(() => openAIRequest).not.toBeNull();
    const serializedRequest = JSON.stringify(openAIRequest);
    expect(serializedRequest).toContain("contexto anterior");
    expect(serializedRequest).toContain("texto seleccionado");
    expect(serializedRequest).toContain("contexto posterior");
    expect(serializedRequest).toContain("Multi track video");
    expect(serializedRequest).not.toContain("wrong English track");
    expect(captionRequests).toHaveLength(1);
    expect(new URL(captionRequests[0] ?? "").searchParams.get("lang")).toBe("es");
  });

  test("distinguishes manual and auto-generated tracks in the same language", async ({ page }) => {
    const captionRequests: string[] = [];
    let openAIRequest: Record<string, unknown> | null = null;
    await page.route("https://www.youtube.com/api/timedtext**", async (route) => {
      const url = new URL(route.request().url());
      captionRequests.push(url.toString());
      const isAutomatic = url.searchParams.get("kind") === "asr";
      await route.fulfill({
        body: JSON.stringify({
          events: [{
            tStartMs: 58000,
            dDurationMs: 5000,
            segs: [{ utf8: isAutomatic ? "same words automatic context" : "same words manual context" }],
          }],
        }),
        contentType: "application/json",
      });
    });
    await page.route("https://api.openai.com/v1/responses", async (route) => {
      openAIRequest = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        body: JSON.stringify({ output_text: "A clear definition." }),
        contentType: "application/json",
      });
    });

    await loadYouTubeFixture(page);
    await page.evaluate(() => {
      const player = document.querySelector("#movie_player") as HTMLElement & {
        getPlayerResponse?: () => unknown;
        getOption?: () => unknown;
        getCurrentTime?: () => number;
      };
      const captionText = document.querySelector(".ytp-caption-text");
      if (!player || !captionText) throw new Error("Caption fixture is incomplete");
      captionText.textContent = "same words";
      player.getCurrentTime = () => 60;
      player.getOption = () => ({ languageCode: "en", vss_id: "a.en", kind: "asr" });
      player.getPlayerResponse = () => ({
        videoDetails: { videoId: "duplicate123", title: "Duplicate language tracks" },
        captions: {
          playerCaptionsTracklistRenderer: {
            captionTracks: [
              {
                baseUrl: "https://www.youtube.com/api/timedtext?v=duplicate123&lang=en",
                languageCode: "en",
                vssId: ".en",
                name: { simpleText: "English" },
              },
              {
                baseUrl: "https://www.youtube.com/api/timedtext?v=duplicate123&lang=en&kind=asr",
                languageCode: "en",
                vssId: "a.en",
                kind: "asr",
                name: { simpleText: "English auto-generated" },
              },
            ],
          },
        },
      });

      const textNode = captionText.firstChild;
      if (!textNode) throw new Error("Caption text is missing");
      const range = document.createRange();
      range.selectNodeContents(textNode);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
      window.dispatchEvent(new KeyboardEvent("keydown", {
        key: "z",
        code: "KeyZ",
        metaKey: true,
        bubbles: true,
        cancelable: true,
      }));
    });

    await expect.poll(() => openAIRequest).not.toBeNull();
    const serializedRequest = JSON.stringify(openAIRequest);
    expect(serializedRequest).toContain("automatic context");
    expect(serializedRequest).not.toContain("manual context");
    expect(captionRequests).toHaveLength(1);
    expect(new URL(captionRequests[0] ?? "").searchParams.get("kind")).toBe("asr");
  });

  test("fetches the translation language selected in the player", async ({ page }) => {
    const captionRequests: string[] = [];
    let openAIRequest: Record<string, unknown> | null = null;
    await page.route("https://www.youtube.com/api/timedtext**", async (route) => {
      const url = new URL(route.request().url());
      captionRequests.push(url.toString());
      const translated = url.searchParams.get("tlang") === "fr";
      await route.fulfill({
        body: JSON.stringify({
          events: [{
            tStartMs: 88000,
            dDurationMs: 5000,
            segs: [{ utf8: translated ? "texte traduit avec contexte" : "untranslated source text" }],
          }],
        }),
        contentType: "application/json",
      });
    });
    await page.route("https://api.openai.com/v1/responses", async (route) => {
      openAIRequest = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        body: JSON.stringify({ output_text: "Une définition claire." }),
        contentType: "application/json",
      });
    });

    await loadYouTubeFixture(page);
    await page.evaluate(() => {
      const player = document.querySelector("#movie_player") as HTMLElement & {
        getPlayerResponse?: () => unknown;
        getOption?: () => unknown;
        getCurrentTime?: () => number;
      };
      const captionText = document.querySelector(".ytp-caption-text");
      if (!player || !captionText) throw new Error("Caption fixture is incomplete");
      captionText.textContent = "texte traduit";
      player.getCurrentTime = () => 90;
      player.getOption = () => ({
        languageCode: "en",
        vss_id: ".en",
        translationLanguage: { languageCode: "fr" },
      });
      player.getPlayerResponse = () => ({
        videoDetails: { videoId: "translated123", title: "Translated captions" },
        captions: {
          playerCaptionsTracklistRenderer: {
            captionTracks: [
              {
                baseUrl: "https://www.youtube.com/api/timedtext?v=translated123&lang=en",
                languageCode: "en",
                vssId: ".en",
                isTranslatable: true,
                name: { simpleText: "English" },
              },
              {
                baseUrl: "https://www.youtube.com/api/timedtext?v=translated123&lang=es",
                languageCode: "es",
                vssId: ".es",
                name: { simpleText: "Spanish" },
              },
            ],
          },
        },
      });

      const textNode = captionText.firstChild;
      if (!textNode) throw new Error("Caption text is missing");
      const range = document.createRange();
      range.selectNodeContents(textNode);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
      window.dispatchEvent(new KeyboardEvent("keydown", {
        key: "z",
        code: "KeyZ",
        metaKey: true,
        bubbles: true,
        cancelable: true,
      }));
    });

    await expect.poll(() => openAIRequest).not.toBeNull();
    const serializedRequest = JSON.stringify(openAIRequest);
    const prompt = (openAIRequest as unknown as { input: Array<{ content: string }> }).input[0]?.content ?? "";
    expect(prompt).toContain('"before":"Video title: Translated captions."');
    expect(prompt).toContain('"selected":"texte traduit"');
    expect(prompt).toContain('"after":"avec contexte"');
    expect(prompt).not.toContain("<<<SELECTED>>>");
    expect(serializedRequest).not.toContain("untranslated source text");
    expect(captionRequests).toHaveLength(1);
    const captionUrl = new URL(captionRequests[0] ?? "");
    expect(captionUrl.searchParams.get("lang")).toBe("en");
    expect(captionUrl.searchParams.get("tlang")).toBe("fr");
  });

  test("falls back from proof-token web captions to a matching InnerTube client track", async ({ page }) => {
    const captionRequests: string[] = [];
    const playerRequests: Array<{ headers: Record<string, string>; body: Record<string, unknown> }> = [];
    let openAIRequest: Record<string, unknown> | null = null;

    await page.route("https://www.youtube.com/youtubei/v1/player**", async (route) => {
      playerRequests.push({
        headers: route.request().headers(),
        body: route.request().postDataJSON() as Record<string, unknown>,
      });
      await route.fulfill({
        body: JSON.stringify({
          playabilityStatus: { status: "OK" },
          captions: {
            playerCaptionsTracklistRenderer: {
              captionTracks: [
                {
                  baseUrl: "https://www.youtube.com/api/timedtext?v=proof123&lang=en",
                  languageCode: "en",
                  vssId: ".en",
                  name: { simpleText: "English" },
                },
                {
                  baseUrl: "https://www.youtube.com/api/timedtext?v=proof123&lang=en&kind=asr&client=ios",
                  languageCode: "en",
                  vssId: "a.en",
                  kind: "asr",
                  name: { simpleText: "English auto-generated" },
                },
              ],
            },
          },
        }),
        contentType: "application/json",
      });
    });
    await page.route("https://www.youtube.com/api/timedtext**", async (route) => {
      const url = new URL(route.request().url());
      captionRequests.push(url.toString());
      const isFallbackAutomaticTrack = url.searchParams.get("client") === "ios"
        && url.searchParams.get("kind") === "asr";
      await route.fulfill({
        body: JSON.stringify({
          events: [{
            tStartMs: 245000,
            dDurationMs: 4000,
            segs: [{ utf8: "The shop is charging a service fee" }],
          }, {
            tStartMs: 282000,
            dDurationMs: 5000,
            segs: [{
              utf8: isFallbackAutomaticTrack
                ? "The shop is charging a fee, but Pixel is charging the battery quickly"
                : "wrong manual transcript",
            }],
          }, {
            tStartMs: 290000,
            dDurationMs: 4000,
            segs: [{ utf8: "The player is charging into battle" }],
          }],
        }),
        contentType: "application/json",
      });
    });
    await page.route("https://api.openai.com/v1/responses", async (route) => {
      openAIRequest = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        body: JSON.stringify({ output_text: "Adding power to a battery." }),
        contentType: "application/json",
      });
    });

    await loadYouTubeFixture(page);
    await page.evaluate(() => {
      const player = document.querySelector("#movie_player") as HTMLElement & {
        getPlayerResponse?: () => unknown;
        getOption?: () => unknown;
        getCurrentTime?: () => number;
      };
      const captionText = document.querySelector(".ytp-caption-text");
      if (!player || !captionText) throw new Error("Caption fixture is incomplete");
      captionText.textContent = "The shop is charging a fee, but Pixel is charging the battery quickly";
      player.getCurrentTime = () => 284;
      player.getOption = () => ({ languageCode: "en", vss_id: "a.en", kind: "asr" });
      player.getPlayerResponse = () => ({
        videoDetails: { videoId: "proof123", title: "Proof token captions" },
        captions: {
          playerCaptionsTracklistRenderer: {
            captionTracks: [{
              baseUrl: "https://www.youtube.com/api/timedtext?v=proof123&lang=en&kind=asr&exp=xpe",
              languageCode: "en",
              vssId: "a.en",
              kind: "asr",
              name: { simpleText: "English auto-generated" },
            }],
          },
        },
      });

      const textNode = captionText.firstChild;
      if (!textNode) throw new Error("Caption text is missing");
      const selectedStart = textNode.textContent?.lastIndexOf("charging") ?? -1;
      if (selectedStart === -1) throw new Error("Repeated selected word is missing");
      const range = document.createRange();
      range.setStart(textNode, selectedStart);
      range.setEnd(textNode, selectedStart + "charging".length);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
      window.dispatchEvent(new KeyboardEvent("keydown", {
        key: "z",
        code: "KeyZ",
        metaKey: true,
        bubbles: true,
        cancelable: true,
      }));
    });

    await expect.poll(() => openAIRequest).not.toBeNull();
    const serializedRequest = JSON.stringify(openAIRequest);
    const prompt = (openAIRequest as unknown as { input: Array<{ content: string }> }).input[0]?.content ?? "";
    expect(serializedRequest).toContain("service fee");
    expect(prompt).toContain('"before":"Video title: Proof token captions. The shop is charging a service fee The shop is charging a fee, but Pixel is"');
    expect(prompt).toContain('"selected":"charging"');
    expect(prompt).toContain('"after":"the battery quickly The player is charging into battle"');
    expect(serializedRequest).toContain("charging into battle");
    expect(prompt).not.toContain("<<<SELECTED>>>");
    expect(serializedRequest).not.toContain("wrong manual transcript");
    expect(playerRequests).toHaveLength(1);
    expect(playerRequests[0]?.headers["x-youtube-client-name"]).toBe("5");
    expect(playerRequests[0]?.body.videoId).toBe("proof123");
    expect(captionRequests).toHaveLength(1);
    const captionUrl = new URL(captionRequests[0] ?? "");
    expect(captionUrl.searchParams.get("client")).toBe("ios");
    expect(captionUrl.searchParams.get("kind")).toBe("asr");
  });

  test("keeps a visible warning until YouTube transcript parsing succeeds again", async ({ page }) => {
    let captionParsingWorks = false;

    await page.route("https://www.youtube.com/api/timedtext**", async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          events: captionParsingWorks
            ? [{
                tStartMs: 118000,
                dDurationMs: 4000,
                segs: [{ utf8: "visible selected subtitle with restored context" }],
              }]
            : [],
        }),
        contentType: "application/json",
      });
    });
    await page.route("https://www.youtube.com/youtubei/v1/player**", async (route) => {
      await route.fulfill({ status: 500, body: "unavailable" });
    });
    await page.route("https://api.openai.com/v1/responses", async (route) => {
      await route.fulfill({
        body: JSON.stringify({ output_text: "A definition." }),
        contentType: "application/json",
      });
    });

    await loadYouTubeFixture(page);

    const prepareSubtitleSelection = async (dispatchSelectionChange: boolean): Promise<void> => {
      await page.evaluate((shouldDispatch) => {
        const player = document.querySelector("#movie_player") as HTMLElement & {
          getPlayerResponse?: () => unknown;
          getOption?: () => unknown;
          getCurrentTime?: () => number;
        };
        const captionText = document.querySelector(".ytp-caption-text");
        if (!player || !captionText) throw new Error("Caption fixture is incomplete");
        captionText.textContent = "visible selected subtitle";
        player.getCurrentTime = () => 120;
        player.getOption = () => ({ languageCode: "en", vss_id: ".en" });
        player.getPlayerResponse = () => ({
          videoDetails: { videoId: "warning123", title: "Warning test" },
          captions: {
            playerCaptionsTracklistRenderer: {
              captionTracks: [{
                baseUrl: "https://www.youtube.com/api/timedtext?v=warning123&lang=en",
                languageCode: "en",
                vssId: ".en",
                name: { simpleText: "English" },
              }],
            },
          },
        });

        const textNode = captionText.firstChild;
        if (!textNode) throw new Error("Caption text is missing");
        const range = document.createRange();
        range.selectNodeContents(textNode);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        if (shouldDispatch) document.dispatchEvent(new Event("selectionchange"));
      }, dispatchSelectionChange);
    };

    await prepareSubtitleSelection(true);
    await page.keyboard.press(process.platform === "darwin" ? "Meta+Z" : "Control+Z");

    const warning = page.locator(".youtube-transcript-warning");
    await expect(warning).toBeVisible();
    await expect(warning).toContainText("YouTube expanded context failed");
    await expect(warning).toContainText("active YouTube caption track could not be downloaded");
    const warningBounds = await warning.boundingBox();
    const viewport = page.viewportSize();
    expect(warningBounds).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(Math.abs(
      (warningBounds?.x ?? 0) + (warningBounds?.width ?? 0) / 2 - (viewport?.width ?? 0) / 2
    )).toBeLessThan(2);
    expect(Math.abs(
      (warningBounds?.y ?? 0) + (warningBounds?.height ?? 0) / 2 - (viewport?.height ?? 0) / 2
    )).toBeLessThan(2);
    await page.waitForTimeout(2200);
    await expect(warning).toBeVisible();
    await expect.poll(() => page.evaluate(() =>
      typeof JSON.parse(localStorage.getItem("__mockChromeStorage") || "{}").youtubeTranscriptFailure
    )).toBe("string");

    await page.reload();
    await expect(warning).toBeVisible();

    captionParsingWorks = true;
    await prepareSubtitleSelection(false);
    await page.evaluate(() => {
      const retry = document.querySelector("#my-ai-helper-host")?.shadowRoot
        ?.querySelector<HTMLButtonElement>(".youtube-transcript-warning-retry");
      retry?.click();
    });

    await expect(warning).toBeHidden();
    await expect.poll(() => page.evaluate(() =>
      JSON.parse(localStorage.getItem("__mockChromeStorage") || "{}").youtubeTranscriptFailure
    )).toBeNull();
  });

  test("logs the TypeScript build only from the top frame", async ({ page }) => {
    const messages: string[] = [];
    page.on("console", (message) => {
      messages.push(message.text());
    });

    await loadYouTubeFixture(page);
    await page.evaluate(async () => {
      const iframe = document.createElement("iframe");
      iframe.srcdoc = '<!doctype html><html><body><script src="/dist/content.js"></script></body></html>';
      document.body.appendChild(iframe);
      await new Promise((resolve) => {
        iframe.addEventListener("load", resolve, { once: true });
      });
    });

    expect(messages.filter((message) => message === "✅ AI Helper TS build loaded")).toHaveLength(1);
  });
});
