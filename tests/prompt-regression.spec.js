import { expect, test } from "@playwright/test";
import { loadExtensionPage } from "./helpers/extensionPage.js";

test.describe("prompt builders", () => {
  test.beforeEach(async ({ page }) => {
    await loadExtensionPage(page);
  });

  test("keeps existing normal-mode prompt boundaries", async ({ page }) => {
    const prompts = await page.evaluate(() => ({
      singleWord: window.buildAnalysisPrompt("nailed", "She nailed the presentation.", "openai", false),
      twoWordPhrase: window.buildAnalysisPrompt("dark factories", "Dark factories are coming.", "openai", false),
      longerPhrase: window.buildAnalysisPrompt("spin the wheel a little bit", "A human had to spin the wheel a little bit.", "openai", false),
      longSelection: window.buildAnalysisPrompt("one two three four five six seven eight nine ten", "context", "openai", false),
    }));

    expect(prompts.singleWord).toBe('Context: "She nailed the presentation." Word: "nailed"');
    expect(prompts.twoWordPhrase).toBe('Context: "Dark factories are coming." Word: "dark factories"');
    expect(prompts.longerPhrase).toBe('Selected: "spin the wheel a little bit". Context: "A human had to spin the wheel a little bit.". Paraphrase ONLY the selected part (not whole context) using different simple words. Only use periods and commas, no other punctuation or formatting.');
    expect(prompts.longSelection).toBe('Selected: "one two three four five six seven eight nine ten". Context: "context". Paraphrase ONLY the selected part (not whole context) using different simple words. Only use periods and commas, no other punctuation or formatting.');
  });

  test("keeps movie-mode prompt wording and context sanitizing", async ({ page }) => {
    const prompts = await page.evaluate(() => ({
      movieSingle: window.buildAnalysisPrompt("crashed", "Line with\nquotes \"and\" slash\\", "openai", true),
      moviePhrase: window.buildAnalysisPrompt("fill me in", "You want to fill me in?", "openai", true),
      movieLong: window.buildAnalysisPrompt("one two three four five six seven eight nine ten", "context", "openai", true),
    }));

    expect(prompts.movieSingle).toBe('Context: "Line withquotes and slash" Word: "crashed"');
    expect(prompts.moviePhrase).toBe('Context: "You want to fill me in?" Word: "fill me in"');
    expect(prompts.movieLong).toBe('I am watching a movie and that these are subtitles. Selected: "one two three four five six seven eight nine ten". Context: "context". Paraphrase ONLY the selected part (not whole context) using different simple words. Only use periods and commas, no other punctuation or formatting.');
  });

  test("preserves conversation prompt formatting", async ({ page }) => {
    const prompt = await page.evaluate(() => window.buildConversationPrompt([
      { role: "system", content: "system prompt" },
      { role: "user", content: 'Context: "x" Word: "nailed"' },
      { role: "assistant", content: "Performed perfectly." },
      { role: "user", content: "more casual?" },
    ], "more casual?"));

    expect(prompt).toContain("[Original request: system prompt]");
    expect(prompt).toContain('USER SELECTED TEXT: "Context: "x" Word: "nailed""');
    expect(prompt).toContain("YOUR PREVIOUS RESPONSE: Performed perfectly.");
    expect(prompt).toContain("USER FOLLOW-UP: more casual?");
    expect(prompt.endsWith("YOUR RESPONSE:")).toBe(true);
  });
});
