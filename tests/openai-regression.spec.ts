import { expect, test } from "@playwright/test";
import { loadExtensionPage } from "./helpers/extensionPage.js";

test.describe("OpenAI provider", () => {
  test("builds response API request and conversation history", async ({ page }) => {
    await loadExtensionPage(page, { responses: ["Performed perfectly."] });

    const result = await page.evaluate(() => window.analyzeWithOpenAILLM("nailed", "She nailed it.", false));
    const calls = await page.evaluate(
      () =>
        globalThis.__fetchCalls as Array<{
          url: string;
          options: { body: Record<string, unknown> };
        }>
    );

    expect(result).toBe("Performed perfectly.");
    expect(calls).toHaveLength(1);
    const [call] = calls;
    if (!call) {
      throw new Error("Expected one fetch call");
    }

    expect(call.url).toBe("https://api.openai.com/v1/responses");
    const followupSystemPrompt = await page.evaluate(() => window.FOLLOWUP_SYSTEM_PROMPT);
    expect(call.options.body).toMatchObject({
      model: "test-openai-model",
      instructions: followupSystemPrompt,
      reasoning: { effort: "low" },
      max_output_tokens: 500,
      text: { verbosity: "low" },
    });
    expect(call.options.body.input).toEqual([
      { role: "user", content: 'Context: "She nailed it." Word: "nailed"' },
    ]);
  });

  test("extracts nested response text fallback", async ({ page }) => {
    await loadExtensionPage(page);

    const text = await page.evaluate(() => window.extractOpenAIText({
      output: [
        {
          type: "message",
          content: [
            { type: "output_text", text: " Nested answer. " },
          ],
        },
      ],
    }));

    expect(text).toBe("Nested answer.");
  });
});
