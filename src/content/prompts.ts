import type { AnalysisContext, ChatMessage } from "../shared/types";

export const FOLLOWUP_SYSTEM_PROMPT =
  "You are a knowledgeable, simple dictionary. Give the definition that fits the context. One or two short sentences, starts uppercase, ends with period. Only commas allowed. Do not borrow words or concepts from the context sentence. Use normal everyday language, not formal or technical. Code context, use the programming meaning. For proper nouns and products, mention what makes them known. The user may ask follow-up questions, just answer them naturally. Never ask the user to provide a word or clarify, just do your best with what they said. Define only the exact word given, not the surrounding phrase. Give one single definition, never list alternatives or second meanings. If the word itself carries a figurative meaning in the context, use that meaning. But if the word is just part of a larger fixed expression, still define just the word on its own, not the whole expression.";

const UTILITY_WORDS = new Set([
  "a",
  "an",
  "the",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "by",
  "from",
  "up",
  "about",
  "into",
  "through",
  "during",
  "before",
  "after",
  "above",
  "below",
  "between",
  "among",
  "under",
  "over",
  "around",
  "near",
  "far",
  "inside",
  "outside",
  "within",
  "without",
  "against",
  "toward",
  "towards",
  "upon",
  "across",
  "behind",
  "beyond",
  "beside",
  "besides",
  "except",
  "including",
  "concerning",
  "regarding",
  "despite",
  "throughout",
  "amid",
  "amidst",
  "amongst",
  "i",
  "me",
  "my",
  "myself",
  "we",
  "us",
  "our",
  "ourselves",
  "you",
  "your",
  "yourself",
  "yourselves",
  "he",
  "him",
  "his",
  "himself",
  "she",
  "her",
  "hers",
  "herself",
  "it",
  "its",
  "itself",
  "they",
  "them",
  "their",
  "theirs",
  "themselves",
  "this",
  "that",
  "these",
  "those",
  "and",
  "or",
  "but",
  "so",
  "yet",
  "nor",
  "because",
  "since",
  "although",
  "though",
  "if",
  "unless",
  "while",
  "whereas",
  "wherever",
  "whenever",
  "however",
  "therefore",
  "moreover",
  "furthermore",
  "nevertheless",
  "nonetheless",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "having",
  "do",
  "does",
  "did",
  "doing",
  "will",
  "would",
  "shall",
  "should",
  "can",
  "could",
  "may",
  "might",
  "must",
  "ought",
  "not",
  "no",
  "yes",
  "very",
  "quite",
  "rather",
  "some",
  "any",
  "all",
  "both",
  "each",
  "every",
  "either",
  "neither",
  "one",
  "two",
  "first",
  "second",
  "last",
  "next",
  "other",
  "another",
  "same",
  "different",
  "such",
  "too",
  "also",
  "just",
  "only",
  "still",
  "already",
  "again",
  "here",
  "there",
  "where",
  "when",
  "why",
  "how",
  "what",
  "who",
  "which",
  "whose",
  "whom",
]);

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

  const words = selectedText
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 0 && !UTILITY_WORDS.has(word));

  if (words.length <= 2) {
    if (structuredBlock) {
      return `${structuredBlock}\nDefine only the selected field.`;
    }
    return `Context: "${sanitizedContext}" Word: "${selectedText}"`;
  }

  const moviePrefix = movieMode ? "I am watching a movie and that these are subtitles." : "";

  if (words.length > 9) {
    if (!lightContextEnabled && (structuredBlock || sanitizedContext)) {
      const contextPart = structuredBlock || `Selected: "${selectedText}". Context: "${sanitizedContext}".`;
      return `${moviePrefix}${moviePrefix ? " " : ""}${contextPart}\nParaphrase ONLY the selected field (not the surrounding context) using different simple words. Do not omit anything. Return just one sentence. Only use periods and commas, no other punctuation or formatting.`;
    }

    return `${moviePrefix}Paraphrase using everyday simple language: "${selectedText}". Do not omit anything. Return just one sentence. Only use periods and commas, no other punctuation or formatting.`;
  }

  const prefix = movieMode ? `${moviePrefix} ` : "";
  if (structuredBlock) {
    return `${prefix}${structuredBlock}\nParaphrase ONLY the selected field (not the surrounding context) using different simple words. Only use periods and commas, no other punctuation or formatting.`;
  }
  return `${prefix}Selected: "${selectedText}". Context: "${sanitizedContext}". Paraphrase ONLY the selected part (not whole context) using different simple words. Only use periods and commas, no other punctuation or formatting.`;
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
