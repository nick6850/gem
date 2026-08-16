import { expect, test } from "@playwright/test";
import { loadExtensionPage, selectText } from "./helpers/extensionPage.js";

test.describe("context extraction", () => {
  test.beforeEach(async ({ page }) => {
    await loadExtensionPage(page);
  });

  test("extracts selected text with sentence context", async ({ page }) => {
    await selectText(page, "#sample", "nailed");

    const context = await page.evaluate(() => window.getContextAroundSelection());

    expect(context.selectedText).toBe("nailed");
    expect(context.contextBefore).toBe("She");
    expect(context.contextAfter).toBe("the presentation and everyone understood the point.");
    expect(context.fullContext).toBe("She nailed the presentation and everyone understood the point.");
  });

  test("extends short sentence context to previous sentence", async ({ page }) => {
    await selectText(page, "#short-context", "crashed");

    const context = await page.evaluate(() => window.getContextAroundSelection());

    expect(context.selectedText).toBe("crashed");
    expect(context.contextBefore).toBe("The server");
    expect(context.contextAfter).toBe(".");
    expect(context.fullContext).toBe("The server crashed .");
  });

  test("does not leave marker nodes in the page after extraction", async ({ page }) => {
    await selectText(page, "#sample", "presentation");
    await page.evaluate(() => window.getContextAroundSelection());

    const markerCount = await page.evaluate(() =>
      document.body.textContent.match(/__GEM_SELECTION_(?:START|END)_[^_]+__/g)?.length || 0
    );
    expect(markerCount).toBe(0);
  });

  test("does not confuse literal marker-like article text with the selection boundary", async ({ page }) => {
    await page.evaluate(() => {
      const paragraph = document.createElement("p");
      paragraph.id = "marker-like-content";
      paragraph.textContent =
        "The article literally says <<<SELECTED>>> here, then the bank will charge a fee.";
      document.querySelector("main")?.prepend(paragraph);
    });
    await selectText(page, "#marker-like-content", "charge");

    const context = await page.evaluate(() => window.getContextAroundSelection());

    expect(context.contextBefore).toContain("bank will");
    expect(context.selectedText).toBe("charge");
    expect(context.contextAfter).toBe("a fee.");
  });

  test("includes surrounding sentences when Light context is disabled", async ({ page }) => {
    await page.evaluate(() => {
      const storage = JSON.parse(localStorage.getItem("__mockChromeStorage") || "{}");
      storage.lightContextEnabled = false;
      localStorage.setItem("__mockChromeStorage", JSON.stringify(storage));
    });
    await page.reload();
    await expect.poll(() => page.evaluate(() =>
      document.querySelector("#my-ai-helper-host")?.shadowRoot
        ?.querySelector(".context-toggle")?.getAttribute("aria-checked")
    )).toBe("false");

    await page.evaluate(() => {
      const paragraph = document.createElement("p");
      paragraph.id = "expanded-context";
      paragraph.textContent =
        "First earlier sentence. Second earlier sentence. The selectedword belongs here. First later sentence. Second later sentence. This sentence is outside the window.";
      document.querySelector("main")?.prepend(paragraph);
    });
    await selectText(page, "#expanded-context", "selectedword");
    const context = await page.evaluate(() => window.getContextAroundSelection());

    expect(context.fullContext).toContain("First earlier sentence.");
    expect(context.fullContext).toContain("Second earlier sentence.");
    expect(context.contextBefore).toContain("The");
    expect(context.selectedText).toBe("selectedword");
    expect(context.contextAfter).toContain("belongs here.");
    expect(context.fullContext).toContain("The selectedword belongs here.");
    expect(context.fullContext).toContain("First later sentence.");
    expect(context.fullContext).toContain("Second later sentence.");
    expect(context.fullContext).not.toContain("outside the window");
  });

  test("caps expanded context at 250 words while retaining the selection", async ({ page }) => {
    await page.evaluate(() => {
      const storage = JSON.parse(localStorage.getItem("__mockChromeStorage") || "{}");
      storage.lightContextEnabled = false;
      localStorage.setItem("__mockChromeStorage", JSON.stringify(storage));
    });
    await page.reload();
    await expect.poll(() => page.evaluate(() =>
      document.querySelector("#my-ai-helper-host")?.shadowRoot
        ?.querySelector(".context-toggle")?.getAttribute("aria-checked")
    )).toBe("false");
    await page.evaluate(() => {
      const paragraph = document.createElement("p");
      paragraph.id = "long-context";
      const words = Array.from({ length: 320 }, (_, index) => index === 160 ? "chosenword" : `word${index}`);
      paragraph.textContent = `${words.join(" ")}.`;
      document.querySelector("main")?.prepend(paragraph);
    });

    await selectText(page, "#long-context", "chosenword");
    const context = await page.evaluate(() => window.getContextAroundSelection());
    expect(context.fullContext.split(/\s+/)).toHaveLength(250);
    expect(context.selectedText).toBe("chosenword");
    expect(context.fullContext).toContain("chosenword");
    expect(context.fullContext).not.toContain("<<<SELECTED>>>");
  });

  test("splits the exact repeated occurrence selected in an article", async ({ page }) => {
    await page.evaluate(() => {
      const paragraph = document.createElement("p");
      paragraph.id = "repeated-meaning-context";
      paragraph.textContent =
        "They charge the battery overnight, the bank will charge a service fee, and the soldiers charge into battle.";
      document.querySelector("main")?.prepend(paragraph);

      const node = paragraph.firstChild;
      if (!node?.textContent) throw new Error("Repeated context is missing");
      const firstIndex = node.textContent.indexOf("charge");
      const selectedIndex = node.textContent.indexOf("charge", firstIndex + 1);
      const range = document.createRange();
      range.setStart(node, selectedIndex);
      range.setEnd(node, selectedIndex + "charge".length);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    });

    const result = await page.evaluate(() => {
      const context = window.getContextAroundSelection();
      return {
        context: context.fullContext,
        before: context.contextBefore,
        selected: context.selectedText,
        after: context.contextAfter,
        prompt: window.buildAnalysisPrompt(
          context.selectedText,
          {
            before: context.contextBefore,
            selected: context.selectedText,
            after: context.contextAfter,
          },
          "openai",
          false,
          false
        ),
      };
    });

    expect(result.context).toContain("charge the battery");
    expect(result.before).toContain("bank will");
    expect(result.selected).toBe("charge");
    expect(result.after).toContain("a service fee");
    expect(result.context).toContain("bank will charge a service fee");
    expect(result.context).toContain("soldiers charge into battle");
    expect(result.context).not.toContain("<<<SELECTED>>>");
    expect(result.prompt).toContain('"before":"They charge the battery overnight, the bank will"');
    expect(result.prompt).toContain('"selected":"charge"');
    expect(result.prompt).toContain('"after":"a service fee, and the soldiers charge into battle."');
    expect(result.prompt).not.toContain("<<<SELECTED>>>");
  });
});
