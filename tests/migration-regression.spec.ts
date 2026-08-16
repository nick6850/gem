import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { loadExtensionPage } from "./helpers/extensionPage.js";

test.describe("TypeScript migration regressions", () => {
  test("builds a prompt for utility-only selections", async ({ page }) => {
    await loadExtensionPage(page);

    const prompt = await page.evaluate(() =>
      window.buildAnalysisPrompt("the", "The first article in a sentence.", "openai", false)
    );

    expect(prompt).toBe('Context: "The first article in a sentence." Word: "the"');
  });

  test("does not create duplicate shadow hosts when the content bundle runs twice", async ({ page }) => {
    await loadExtensionPage(page);

    await page.addScriptTag({ url: "/dist/content.js" });

    await expect(page.locator("#my-ai-helper-host")).toHaveCount(1);
  });

  test("manifest loads bundled content only and keeps offscreen out of page scripts", async () => {
    const manifest = JSON.parse(await readFile("manifest.json", "utf8")) as {
      background?: { service_worker?: string };
      content_scripts?: Array<{
        js?: string[];
        matches?: string[];
        run_at?: string;
        world?: string;
      }>;
    };

    expect(manifest.background?.service_worker).toBe("dist/background.js");
    expect(manifest.content_scripts?.[0]?.js).toEqual(["dist/content.js"]);
    expect(manifest.content_scripts?.[0]?.js ?? []).not.toContain("offscreen.js");
    expect(manifest.content_scripts?.[1]).toEqual({
      matches: ["https://*.youtube.com/*"],
      js: ["dist/youtube-bridge.js"],
      run_at: "document_start",
      world: "MAIN",
    });
  });

  test("reports missing OpenAI config clearly", async ({ page }) => {
    await page.addInitScript(() => {
      globalThis.GEM_CONFIG = {
        defaultProvider: "openai",
        openai: {
          apiKey: "",
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

    await page.goto("/tests/fixtures/page.html");
    await expect(page.locator("#my-ai-helper-host")).toHaveCount(1);

    await expect(
      page.evaluate(() => window.analyzeWithOpenAILLM("nailed", "She nailed it.", false))
    ).rejects.toThrow(/OpenAI API key not configured/);
  });
});
