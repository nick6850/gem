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

  test("sends phrase system instructions on the initial Gemini request", async ({ page }) => {
    await loadExtensionPage(page);

    await page.evaluate(() => {
      globalThis.GEM_CONFIG = {
        ...globalThis.GEM_CONFIG,
        gemini: { apiKey: "test-gemini-key", model: "test-gemini-model" },
      };
      globalThis.__fetchCalls = [];
      globalThis.fetch = (async (url: RequestInfo | URL, options: RequestInit = {}) => {
        const body = options.body ? JSON.parse(String(options.body)) : null;
        globalThis.__fetchCalls?.push({ url: String(url), options: { ...options, body } });
        return {
          ok: true,
          status: 200,
          async json() {
            return { candidates: [{ content: { parts: [{ text: "Complete offer paraphrase." }] } }] };
          },
          async text() {
            return "";
          },
        };
      }) as typeof fetch;
      window.setLLMProvider("gemini");
    });

    const result = await page.evaluate(() => window.analyzeText(
      "99 for a four-pack",
      {
        before: "It costs 9 bucks for one or",
        selected: "99 for a four-pack",
        after: ".",
      },
      false
    ));
    const body = await page.evaluate(() => (
      globalThis.__fetchCalls?.[0] as {
        options: {
          body: {
            systemInstruction?: { parts: Array<{ text: string }> };
            contents: Array<{ parts: Array<{ text: string }> }>;
          };
        };
      }
    ).options.body);

    expect(result).toBe("Complete offer paraphrase.");
    expect(body.systemInstruction?.parts[0]?.text).toContain(
      "Rewrite the entire selected field as one unit"
    );
    expect(body.contents[0]?.parts[0]?.text).toContain('"selected":"99 for a four-pack"');
  });

  test("sends the same phrase system instructions to the local provider", async ({ page }) => {
    await loadExtensionPage(page);

    await page.evaluate(() => {
      globalThis.__fetchCalls = [];
      globalThis.fetch = (async (url: RequestInfo | URL, options: RequestInit = {}) => {
        const body = options.body ? JSON.parse(String(options.body)) : null;
        globalThis.__fetchCalls?.push({ url: String(url), options: { ...options, body } });
        return {
          ok: true,
          status: 200,
          async json() {
            return { message: { content: "Complete local paraphrase." } };
          },
          async text() {
            return "";
          },
        };
      }) as typeof fetch;
      window.setLLMProvider("local");
    });

    const result = await page.evaluate(() => window.analyzeText(
      "99 for a four-pack",
      {
        before: "It costs 9 bucks for one or",
        selected: "99 for a four-pack",
        after: ".",
      },
      false
    ));
    const messages = await page.evaluate(() => (
      globalThis.__fetchCalls?.[0] as {
        options: { body: { messages: Array<{ role: string; content: string }> } };
      }
    ).options.body.messages);

    expect(result).toBe("Complete local paraphrase.");
    expect(messages[0]).toMatchObject({ role: "system" });
    expect(messages[0]?.content).toContain("Rewrite the entire selected field as one unit");
    expect(messages[1]?.content).toContain('"selected":"99 for a four-pack"');
  });
});
