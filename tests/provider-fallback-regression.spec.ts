import { expect, test } from "@playwright/test";
import { loadExtensionPage } from "./helpers/extensionPage.js";

test.describe("provider fallback", () => {
  test("falls back from local provider to OpenAI without losing the response", async ({ page }) => {
    await loadExtensionPage(page);

    await page.evaluate(() => {
      globalThis.__fetchCalls = [];
      globalThis.fetch = (async (url: RequestInfo | URL, options: RequestInit = {}) => {
        const body = options.body ? JSON.parse(String(options.body)) : null;
        globalThis.__fetchCalls ??= [];
        globalThis.__fetchCalls.push({ url: String(url), options: { ...options, body } });

        if (String(url).includes("localhost:11434")) {
          return {
            ok: false,
            status: 500,
            async text() {
              return "local unavailable";
            },
            async json() {
              return {};
            },
          };
        }

        return {
          ok: true,
          status: 200,
          async json() {
            return { output_text: "Fallback answer." };
          },
          async text() {
            return JSON.stringify({ output_text: "Fallback answer." });
          },
        };
      }) as typeof fetch;
    });

    await page.evaluate(() => window.setLLMProvider("local"));
    const result = await page.evaluate(() => window.analyzeText("nailed", "She nailed it.", false));
    const calls = await page.evaluate(() =>
      (globalThis.__fetchCalls as Array<{ url: string }>).map((call) => call.url)
    );

    expect(result).toBe("Fallback answer.");
    expect(calls).toEqual([
      "http://localhost:11434/api/chat",
      "https://api.openai.com/v1/responses",
    ]);
  });
});
