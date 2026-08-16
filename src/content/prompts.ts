import type { AnalysisContext, ChatMessage } from "../shared/types";

export type AnalysisTask = "define" | "paraphrase";

export const DEFINITION_SYSTEM_PROMPT =
  "You are a knowledgeable, simple dictionary. Define the entire selected field as one lexical item, name, product, or term, using the surrounding context to choose the intended meaning. If the selected field contains multiple words, treat them together and never define only one part of it. Give one single definition, never list alternatives or second meanings. One or two short sentences, starts uppercase, ends with a period. Only commas and periods are allowed. Use normal everyday language, not formal or technical. Code context, use the programming meaning. For proper nouns and products, mention what makes them known. If the user asks a follow-up question, answer it naturally. Never ask the user to clarify, just do your best with the available context.";

export const PARAPHRASE_SYSTEM_PROMPT =
  "You rewrite selected text in plain everyday language. Rewrite the entire selected field as one unit, never define or explain only one word from it. Preserve every number, quantity, price, negation, comparison, and relationship. Use the surrounding context only to resolve references or meaning omitted from the selection, including an implied unit such as dollars. Do not paraphrase the surrounding context itself. Return one short complete sentence, starts uppercase, ends with a period. Only commas and periods are allowed. Do not omit anything or add unsupported facts. If the user asks a follow-up question, answer it naturally. Never ask the user to clarify, just do your best with the available context.";

// Kept as the public default for compatibility with the extension's prompt helpers.
export const FOLLOWUP_SYSTEM_PROMPT = DEFINITION_SYSTEM_PROMPT;

const TERM_CONNECTORS = new Set([
  "a",
  "an",
  "and",
  "at",
  "by",
  "for",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);

export function getAnalysisTask(selectedText: string): AnalysisTask {
  const tokens = selectedText.trim().split(/\s+/u).filter(Boolean);
  if (tokens.length <= 2) return "define";
  if (/\p{N}/u.test(selectedText) || tokens.length > 9) return "paraphrase";

  const significantTokens = tokens.filter((token) => {
    const normalized = token.toLocaleLowerCase().replaceAll(/^\P{L}+|\P{L}+$/gu, "");
    return normalized && !TERM_CONNECTORS.has(normalized);
  });
  return significantTokens.length <= 2 ? "define" : "paraphrase";
}

export function getAnalysisSystemPrompt(selectedText: string): string {
  return getAnalysisTask(selectedText) === "define"
    ? DEFINITION_SYSTEM_PROMPT
    : PARAPHRASE_SYSTEM_PROMPT;
}

export function buildConversationPrompt(
  conversationHistory: readonly ChatMessage[],
  currentQuestion: string
): string {
  let prompt = "=== CONVERSATION HISTORY ===\n\n";

  conversationHistory.forEach((msg, index) => {
    if (msg.role === "system") {
      prompt += `[Original request: ${msg.content}]\n\n`;
    } else if (msg.role === "user" && index === 1) {
      if (msg.content.includes("Selected text:") && msg.content.includes("Context:")) {
        prompt += `USER SELECTED TEXT: ${msg.content}\n\n`;
      } else {
        prompt += `USER SELECTED TEXT: "${msg.content}"\n\n`;
      }
    } else if (msg.role === "assistant") {
      prompt += `YOUR PREVIOUS RESPONSE: ${msg.content}\n\n`;
    } else if (msg.role === "user" && index > 1) {
      prompt += `USER FOLLOW-UP: ${msg.content}\n\n`;
    }
  });

  prompt += "=== END OF HISTORY ===\n\n";

  const lastMsg = conversationHistory.at(-1);
  if (!lastMsg || lastMsg.content !== currentQuestion) {
    prompt += `USER'S CURRENT QUESTION: ${currentQuestion}\n\nYOUR RESPONSE:`;
  } else {
    prompt += "YOUR RESPONSE:";
  }

  return prompt;
}

export function buildAnalysisPrompt(
  selectedText: string,
  context: AnalysisContext,
  _provider = "gemini",
  movieMode = false,
  lightContextEnabled = true
): string {
  const sanitize = (value: string): string => value
    .replaceAll(/[\n"'""“”\\]/g, "")
    .replaceAll(/\s+/g, " ");
  const structuredContext = typeof context === "string" ? null : context;
  const sanitizedContext = typeof context === "string" ? sanitize(context) : "";
  const structuredBlock = structuredContext
    ? `Selection context JSON: ${JSON.stringify({
        before: structuredContext.before,
        selected: structuredContext.selected || selectedText,
        after: structuredContext.after,
      })}`
    : "";

  const tokenCount = selectedText.trim().split(/\s+/u).filter(Boolean).length;

  if (getAnalysisTask(selectedText) === "define") {
    if (structuredBlock) {
      return `${structuredBlock}\nDefine the entire selected field as one term. Never define only part of it.`;
    }
    return `Context: "${sanitizedContext}" Word: "${selectedText}"`;
  }

  const moviePrefix = movieMode ? "I am watching a movie and these are subtitles." : "";
  const paraphraseInstruction =
    "Paraphrase the entire selected field as one unit using simple everyday words. Preserve every number, quantity, price, comparison, negation, and relationship. Never define only one word from it. Use the surrounding context only to resolve implied meaning. Do not omit anything. Return one sentence. Only use periods and commas, no other punctuation or formatting.";

  if (tokenCount > 9) {
    if (!lightContextEnabled && (structuredBlock || sanitizedContext)) {
      const contextPart = structuredBlock || `Selected: "${selectedText}". Context: "${sanitizedContext}".`;
      return `${moviePrefix}${moviePrefix ? " " : ""}${contextPart}\n${paraphraseInstruction}`;
    }

    return `${moviePrefix}${moviePrefix ? " " : ""}Selected: "${selectedText}".\n${paraphraseInstruction}`;
  }

  const prefix = movieMode ? `${moviePrefix} ` : "";
  if (structuredBlock) {
    return `${prefix}${structuredBlock}\n${paraphraseInstruction}`;
  }
  return `${prefix}Selected: "${selectedText}". Context: "${sanitizedContext}".\n${paraphraseInstruction}`;
}

export function buildFollowupPrompt(
  originalSelection = "",
  lastAssistantMessage = "",
  userQuestion = ""
): string {
  return buildConversationPrompt(
    [
      { role: "system", content: FOLLOWUP_SYSTEM_PROMPT },
      { role: "user", content: originalSelection },
      { role: "assistant", content: lastAssistantMessage },
      { role: "user", content: userQuestion },
    ],
    userQuestion
  );
}

export function installPromptGlobals(): void {
  window.buildAnalysisPrompt = buildAnalysisPrompt;
  window.buildConversationPrompt = buildConversationPrompt;
  window.buildFollowupPrompt = buildFollowupPrompt;
  window.FOLLOWUP_SYSTEM_PROMPT = FOLLOWUP_SYSTEM_PROMPT;
}
