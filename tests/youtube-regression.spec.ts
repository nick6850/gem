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

    (globalThis as unknown as { chrome: unknown }).chrome = {
      runtime: {
        sendMessage() {},
        onMessage: {
          addListener() {},
        },
      },
    };
  });
}

async function routeYouTubeFixture(page: Page): Promise<void> {
  const [fixtureHtml, contentBundle] = await Promise.all([
    readFile("tests/fixtures/youtube.html", "utf8"),
    readFile("dist/content.js", "utf8"),
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
