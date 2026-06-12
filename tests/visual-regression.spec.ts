import { expect, test } from "@playwright/test";
import { loadExtensionPage, selectText, triggerAnalyzeShortcut } from "./helpers/extensionPage.js";

test.describe("visual snapshots", () => {
  test("popup look remains stable", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "single desktop baseline avoids duplicate snapshot churn");

    await loadExtensionPage(page, { responses: ["Performed perfectly."] });
    await selectText(page, "#sample", "nailed");
    await triggerAnalyzeShortcut(page);
    await expect.poll(async () => page.evaluate(() => {
      const root = document.querySelector("#my-ai-helper-host")?.shadowRoot;
      if (!root) {
        throw new Error("Extension shadow root not found");
      }

      return [...root.querySelectorAll(".message")].map((node) => node.textContent.trim());
    })).toEqual(["nailed", "Performed perfectly."]);

    await expect(page.locator(".popup")).toHaveScreenshot("popup-open.png", {
      maxDiffPixelRatio: 0.02,
      animations: "disabled",
    });
  });
});
