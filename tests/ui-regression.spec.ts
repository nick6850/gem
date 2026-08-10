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
    const viewport = page.viewportSize();
    if (!viewport) {
      throw new Error("Viewport not available");
    }

    expect(state.popup.display).toBe("block");
    expect(state.overlayDisplay).toBe("block");
    expect(state.popup.width).toBeLessThanOrEqual(Math.min(332, viewport.width - 40) + 40);
    expect(state.popup.scrollWidth).toBeLessThanOrEqual(state.popup.clientWidth + 1);
    expect(state.messages[0]?.width).toBeGreaterThan(40);
    expect(state.messages[1]?.height).toBeGreaterThan(20);
  });

  test("captures the analyze shortcut before the page stops the keyboard event", async ({ page }) => {
    await selectText(page, "#sample", "nailed");
    await page.evaluate(() => {
      document.body.addEventListener("keydown", (event) => event.stopPropagation(), { once: true });
    });

    await page.keyboard.press(process.platform === "darwin" ? "Meta+Z" : "Control+Z");

    await expect.poll(async () => (await getExtensionState(page)).messages.map((message) => message.text)).toEqual([
      "nailed",
      "Performed perfectly.",
    ]);
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

  test("records, removes, and persists analyze shortcuts", async ({ page }) => {
    await selectText(page, "#sample", "nailed");
    await triggerAnalyzeShortcut(page);
    await expect(page.locator(".popup-action-button[aria-label='Open settings']")).toBeVisible();

    await page.locator(".popup-action-button[aria-label='Open settings']").click();
    await expect(page.locator(".settings-view")).toBeVisible();
    await expect(page.locator(".popup-main-view")).toBeHidden();
    await expect(page.locator(".shortcut-record-button")).toHaveText(["⌘Z"]);
    const sharedStyles = await page.evaluate(() => {
      const root = document.querySelector("#my-ai-helper-host")?.shadowRoot;
      const style = (selector: string) => {
        const element = root?.querySelector(selector);
        if (!element) throw new Error(`Missing ${selector}`);
        return getComputedStyle(element);
      };
      return {
        headerBackground: style(".settings-header").backgroundColor,
        userBackground: style(".message.user").backgroundColor,
        cardBackground: style(".settings-card").backgroundColor,
        aiBackground: style(".message.ai").backgroundColor,
        cardBorder: style(".settings-card").borderColor,
        inputBorder: style(".followup-input").borderColor,
        cardRadius: style(".settings-card").borderRadius,
        messageRadius: style(".message").borderRadius,
        keycapRadius: style(".shortcut-keycap").borderRadius,
        inputRadius: style(".followup-input").borderRadius,
      };
    });
    expect(sharedStyles).toMatchObject({
      headerBackground: sharedStyles.userBackground,
      cardBackground: sharedStyles.aiBackground,
      cardBorder: sharedStyles.inputBorder,
      cardRadius: sharedStyles.messageRadius,
      keycapRadius: sharedStyles.inputRadius,
    });

    await page.locator(".shortcut-add-button").click();
    await page.evaluate(() => {
      const recorder = document
        .querySelector("#my-ai-helper-host")
        ?.shadowRoot?.querySelector(".shortcut-record-button.is-recording");
      recorder?.dispatchEvent(new KeyboardEvent("keydown", {
        key: "b",
        metaKey: true,
        bubbles: true,
        cancelable: true,
        composed: true,
      }));
    });
    await expect(page.locator(".shortcut-record-button")).toHaveText(["⌘Z", "⌘B"]);

    await page.locator(".shortcut-delete-button").first().click();
    await expect(page.locator(".shortcut-record-button")).toHaveText(["⌘B"]);
    await expect(page.locator(".shortcut-keycap:first-child")).toHaveCSS("font-size", "10px");
    await expect(page.locator(".settings-save-button")).toHaveCSS("background-color", "rgb(80, 129, 240)");
    const storedBeforeSave = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("__mockChromeStorage") || "{}").analyzeShortcuts
    );
    expect(storedBeforeSave).toMatchObject([{ key: "z", metaKey: true }]);

    await page.locator(".settings-save-button").click();
    await expect(page.locator(".settings-save-button")).toHaveText("Saved");

    await page.reload();
    await expect(page.locator("#my-ai-helper-host")).toHaveCount(1);
    await selectText(page, "#sample", "nailed");
    await page.evaluate(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", {
        key: "b",
        metaKey: true,
        bubbles: true,
        cancelable: true,
      }));
    });
    await expect.poll(async () => (await getExtensionState(page)).messages.map((message) => message.text)).toEqual([
      "nailed",
      "Performed perfectly.",
    ]);
  });
});
