import { expect, test } from "@playwright/test";
import { getExtensionState, loadExtensionPage, selectText, triggerAnalyzeShortcut } from "./helpers/extensionPage.js";

test.describe("popup UI regression", () => {
  test.beforeEach(async ({ page }) => {
    await loadExtensionPage(page, { responses: ["Performed perfectly."] });
  });

  test("keeps initial hidden UI structure and dimensions", async ({ page }) => {
    const state = await getExtensionState(page);

    expect(state.popup.display).toBe("none");
    expect(state.popup.overflowX).toBe("hidden");
    expect(state.popup.overflowY).toBe("auto");
    expect(state.popup.boxSizing).toBe("border-box");
    expect(state.popup.borderRadius).toBe("8px");
    expect(state.input.placeholder).toBe("Ask a follow-up question...");
    expect(state.input.fontSize).toBe("13px");
    expect(state.quickPrompts).toEqual(["RU", "Example", "Context", "Sentence", "Culture", "Origin", "More", "Simplify"]);
    expect(state.bodyOverflowingX).toBe(false);
  });

  test("opens centered popup without accidental horizontal overflow", async ({ page }) => {
    await selectText(page, "#sample", "nailed");
    await triggerAnalyzeShortcut(page);
    await expect.poll(async () => (await getExtensionState(page)).messages.map((m) => m.text)).toEqual([
      "nailed",
      "Performed perfectly.",
    ]);

    const state = await getExtensionState(page);
    expect(state.popup.display).toBe("block");
    expect(state.overlayDisplay).toBe("block");
    expect(state.popup.width).toBeLessThanOrEqual(Math.min(332, page.viewportSize().width - 40) + 40);
    expect(state.popup.scrollWidth).toBeLessThanOrEqual(state.popup.clientWidth + 1);
    expect(state.messages[0].width).toBeGreaterThan(40);
    expect(state.messages[1].height).toBeGreaterThan(20);
  });

  test("keeps keyboard shortcut notifications stable", async ({ page }) => {
    await page.keyboard.press(process.platform === "darwin" ? "Meta+1" : "Control+1");
    let state = await getExtensionState(page);
    expect(state.notification.display).toBe("block");
    expect(state.notification.text).toBe("L Switched to Local LLM");

    await page.keyboard.press(process.platform === "darwin" ? "Meta+2" : "Control+2");
    state = await getExtensionState(page);
    expect(state.notification.display).toBe("block");
    expect(state.notification.text).toBe("🎬 Movie Mode ON");
  });
});
