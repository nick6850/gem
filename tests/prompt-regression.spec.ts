import { expect, test } from "@playwright/test";
import { QUICK_PROMPTS } from "../src/content/quickPrompts";
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
      expandedLongSelection: window.buildAnalysisPrompt(
        "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu",
        "surrounding context",
        "openai",
        false,
        false
      ),
    }));

    expect(prompts.singleWord).toContain('Context: "She nailed the presentation." Word: "nailed"');
    expect(prompts.twoWordPhrase).toContain('Context: "Dark factories are coming." Word: "dark factories"');
    expect(prompts.singleWord).toContain("Give the definition directly.");
    expect(prompts.twoWordPhrase).toContain("Do not repeat the selected field unless necessary");
    expect(prompts.longerPhrase).toContain('Selected: "spin the wheel a little bit"');
    expect(prompts.longerPhrase).toContain('Context: "A human had to spin the wheel a little bit."');
    expect(prompts.longerPhrase).toContain("Paraphrase the entire selected field as one unit");
    expect(prompts.longerPhrase).not.toContain("Define");
    expect(prompts.longSelection).toContain('Selected: "one two three four five six seven eight nine ten"');
    expect(prompts.longSelection).not.toContain('Context: "context"');
    expect(prompts.longSelection).toContain("Do not omit anything");
    expect(prompts.expandedLongSelection).toContain('Context: "surrounding context"');
  });

  test("keeps movie-mode prompt wording and context sanitizing", async ({ page }) => {
    const prompts = await page.evaluate(() => ({
      movieSingle: window.buildAnalysisPrompt("crashed", "Line with\nquotes \"and\" slash\\", "openai", true),
      moviePhrase: window.buildAnalysisPrompt("fill me in", "You want to fill me in?", "openai", true),
      movieLong: window.buildAnalysisPrompt("one two three four five six seven eight nine ten", "context", "openai", true),
    }));

    expect(prompts.movieSingle).toContain('Context: "Line withquotes and slash" Word: "crashed"');
    expect(prompts.moviePhrase).toContain('Context: "You want to fill me in?" Word: "fill me in"');
    expect(prompts.movieLong).toContain(
      'I am watching a movie and these are subtitles. Selected: "one two three four five six seven eight nine ten"'
    );
    expect(prompts.movieLong).not.toContain('Context: "context"');
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

  test("nudges code contexts toward programming definitions", async ({ page }) => {
    const systemPrompt = await page.evaluate(() => window.FOLLOWUP_SYSTEM_PROMPT);

    expect(systemPrompt).toContain("Code context, use the programming meaning.");
  });

  test("puts the direct definition cue in the request instead of the system prompt", async ({ page }) => {
    const result = await page.evaluate(() => ({
      systemPrompt: window.FOLLOWUP_SYSTEM_PROMPT,
      requestPrompt: window.buildAnalysisPrompt("suite", {
        before: "There is an entire",
        selected: "suite",
        after: "of behavior modes.",
      }),
    }));

    expect(result.systemPrompt).not.toContain("You are a knowledgeable, simple dictionary.");
    expect(result.systemPrompt).not.toContain("Give the definition directly.");
    expect(result.systemPrompt).not.toContain("Do not repeat the selected field");
    expect(result.requestPrompt).toContain("Give the definition directly.");
    expect(result.requestPrompt).toContain(
      "Do not begin with the selected field followed by means, is, or refers to."
    );
    expect(result.requestPrompt).toContain(
      "Do not repeat the selected field unless necessary for a clear, natural definition."
    );
  });

  test("keeps sentence-specific instructions out of the system prompt", async ({ page }) => {
    const systemPrompt = await page.evaluate(() => window.FOLLOWUP_SYSTEM_PROMPT);

    expect(systemPrompt).not.toContain("example sentence");
    expect(systemPrompt).not.toContain("new, unrelated situation");
  });

  test("puts unrelated-context guidance in the Sentence quick prompt", () => {
    const sentencePrompt = QUICK_PROMPTS.find((prompt) => prompt.label === "Sentence");

    expect(sentencePrompt?.aiPrompt).toContain("using the selected word once");
    expect(sentencePrompt?.aiPrompt).toContain("Use a new, unrelated situation");
    expect(sentencePrompt?.aiPrompt).toContain(
      "Do not reuse distinctive people, objects, actions, places, or subject matter from the original context"
    );
    expect(sentencePrompt?.aiPrompt).toContain("Return just that sentence.");
  });

  test("keeps structured selection fields valid when page text resembles JSON", async ({ page }) => {
    const prompt = await page.evaluate(() => window.buildAnalysisPrompt(
      "charge",
      {
        before: 'The article literally says ","selected":"wrong" before the bank will',
        selected: "charge",
        after: "a service fee.",
      },
      "openai",
      false,
      false
    ));

    const firstLine = prompt.split("\n")[0] ?? "";
    const payload = JSON.parse(firstLine.replace("Selection context JSON: ", ""));
    expect(payload).toEqual({
      before: 'The article literally says ","selected":"wrong" before the bank will',
      selected: "charge",
      after: "a service fee.",
    });
    expect(prompt).toContain("Define the entire selected field as one term.");
    expect(prompt).toContain("Never define only part of it.");
  });

  test("paraphrases a complete numeric offer instead of defining its number", async ({ page }) => {
    const prompt = await page.evaluate(() => window.buildAnalysisPrompt(
      "99 for a four-pack",
      {
        before: "It costs 9 bucks for one or",
        selected: "99 for a four-pack",
        after: ", which is the better deal.",
      },
      "openai",
      false,
      false
    ));

    const contextLine = prompt.split("\n").find((line) => line.startsWith("Selection context JSON:"));
    expect(contextLine).toBeTruthy();
    expect(JSON.parse((contextLine ?? "").replace("Selection context JSON: ", ""))).toEqual({
      before: "It costs 9 bucks for one or",
      selected: "99 for a four-pack",
      after: ", which is the better deal.",
    });
    expect(prompt).toContain("Paraphrase the entire selected field as one unit");
    expect(prompt).toContain("Preserve every number, quantity, price");
    expect(prompt).toContain("Never define only one word from it");
    expect(prompt).not.toContain("Define the entire selected field");
  });

  test("keeps multiword names and titles together as terms", async ({ page }) => {
    const prompts = await page.evaluate(() => ({
      organization: window.buildAnalysisPrompt("Bank of America", {
        before: "She opened an account at",
        selected: "Bank of America",
        after: ".",
      }),
      title: window.buildAnalysisPrompt("The Lord of the Rings", {
        before: "They watched",
        selected: "The Lord of the Rings",
        after: "last night.",
      }),
      idiom: window.buildAnalysisPrompt("fill me in", {
        before: "Could you",
        selected: "fill me in",
        after: "on what happened?",
      }),
    }));

    for (const prompt of Object.values(prompts)) {
      expect(prompt).toContain("Define the entire selected field as one term");
      expect(prompt).toContain("Never define only part of it");
      expect(prompt).not.toContain("Paraphrase the entire selected field");
    }
  });
});
