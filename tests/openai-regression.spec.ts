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
    const input = call.options.body.input as Array<{ role: string; content: string }>;
    expect(input).toHaveLength(1);
    expect(input[0]).toMatchObject({ role: "user" });
    expect(input[0]?.content).toContain('Context: "She nailed it." Word: "nailed"');
    expect(input[0]?.content).toContain("Give the definition directly.");
    expect(input[0]?.content).toContain("Do not repeat the selected field unless necessary");
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

  test("uses phrase instructions for the entire selected offer and retains them for follow-ups", async ({ page }) => {
    await loadExtensionPage(page, {
      responses: ["Ninety nine dollars for a package containing four.", "A four-pack contains four items."],
    });

    const initial = await page.evaluate(() => window.analyzeWithOpenAILLM(
      "99 for a four-pack",
      {
        before: "It costs 9 bucks for one or",
        selected: "99 for a four-pack",
        after: ", which is the better deal.",
      },
      false
    ));
    const followup = await page.evaluate(() =>
      window.analyzeWithOpenAILLM("What does four-pack mean?", "", true)
    );
    const calls = await page.evaluate(() => globalThis.__fetchCalls as Array<{
      options: { body: { instructions: string; input: Array<{ role: string; content: string }> } };
    }>);

    expect(initial).toBe("Ninety nine dollars for a package containing four.");
    expect(followup).toBe("A four-pack contains four items.");
    expect(calls).toHaveLength(2);
    const initialBody = calls[0]?.options.body;
    const followupBody = calls[1]?.options.body;
    expect(initialBody?.instructions).toContain("Rewrite the entire selected field as one unit");
    expect(initialBody?.instructions).toContain("Preserve every number, quantity, price");
    expect(initialBody?.instructions).not.toContain("simple dictionary");
    expect(initialBody?.input[0]?.content).toContain('"selected":"99 for a four-pack"');
    expect(initialBody?.input[0]?.content).toContain("Never define only one word from it");
    expect(followupBody?.instructions).toBe(initialBody?.instructions);
    expect(followupBody?.input.at(-1)).toEqual({
      role: "user",
      content: "What does four-pack mean?",
    });
  });
});
