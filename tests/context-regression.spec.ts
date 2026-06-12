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
    expect(context.contextBefore).toBe("");
    expect(context.contextAfter).toBe("");
    expect(context.fullContext).toBe("She  nailed  the presentation and everyone understood the point.");
  });

  test("extends short sentence context to previous sentence", async ({ page }) => {
    await selectText(page, "#short-context", "crashed");

    const context = await page.evaluate(() => window.getContextAroundSelection());

    expect(context.selectedText).toBe("crashed");
    expect(context.fullContext).toBe("The server  crashed  .");
  });

  test("does not leave marker nodes in the page after extraction", async ({ page }) => {
    await selectText(page, "#sample", "presentation");
    await page.evaluate(() => window.getContextAroundSelection());

    const markerCount = await page.evaluate(() => document.body.textContent.match(/<<<SELECTED>>>|<<<\/SELECTED>>>/g)?.length || 0);
    expect(markerCount).toBe(0);
  });
});
