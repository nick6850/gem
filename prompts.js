// == Shared Prompts for LLM Integration ==

// Detailed analysis prompt for Gemini
const GEMINI_ANALYSIS_PROMPT = `You are analyzing selected text from a webpage.

Selected text: "{SELECTED_TEXT}"
Context: "{CONTEXT}"

1. Define or explain the selected text:
 - If it is a single word, collocation, or idiom, provide its most common meaning. If it's a verb, use its infinitive form.
 - If it's longer than three words, paraphrase it simply for easy understanding, without repeating the original phrase.

2. Analyze its meaning and usage in the context:
 - If it includes slang, metaphors, jokes, or cultural references, explain them clearly.
 - Keep explanations short, clear, and easy to understand.

Examples:
Selected text: "snowbank"
Context: "Where do polar bears keep their money? In a snowbank."
Your Output: **Definition:** Snowbank means a pile of snow. **Context analysis:** This is a wordplay joke. It refers to both a pile of snow and a bank where you keep money.

Selected text: "from time to time" 
Context: "I ask them from time to time about their progress."
Your Output: **Definition:** Occasionally or every once in a while.

Keep only output portion!
`;
// Simple analysis prompt for local LLM
const LOCAL_ANALYSIS_PROMPT = `Give a definition JUST to  as if it was STANDALONE. Short sentence, general language, 18+ allowed.`;

// Concise system prompt for follow-ups
const FOLLOWUP_SYSTEM_PROMPT = `You are a helpful assistant analyzing text from webpages. Answer follow-up questions based on the conversation history. Keep responses concise and relevant.`;

// Function to build conversation history prompt
function buildConversationPrompt(conversationHistory, currentQuestion) {
  let prompt = "Conversation history:\n";

  conversationHistory.forEach((msg, index) => {
    if (msg.role === "system") {
      // Skip system messages in the conversation history display
      return;
    } else if (msg.role === "user" && index === 1) {
      // Index 1 because system is at index 0
      // Check if this is the initial user message with selected text and context
      if (
        msg.content.includes("Selected text:") &&
        msg.content.includes("Context:")
      ) {
        prompt += `User selected: ${msg.content}\n\n`;
      } else {
        prompt += `User selected: "${msg.content}"\n\n`;
      }
    } else if (msg.role === "assistant") {
      prompt += `Assistant: ${msg.content}\n\n`;
    } else if (msg.role === "user" && index > 1) {
      prompt += `User: ${msg.content}\n\n`;
    }
  });

  // Only add current question if it's not already in history
  const lastMsg = conversationHistory[conversationHistory.length - 1];
  if (!lastMsg || lastMsg.content !== currentQuestion) {
    prompt += `User: ${currentQuestion}\n\nAssistant:`;
  } else {
    prompt += `Assistant:`;
  }

  return prompt;
}

// Function to build the analysis prompt with selectedText and context
function buildAnalysisPrompt(selectedText, context, provider = "gemini") {
  context = context.replaceAll(/[\n"'""“”\\]/g, "").replaceAll(/\s+/g, " ");
  const utilityWords = [
    // Articles
    "a",
    "an",
    "the",
    // Prepositions
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
    // Pronouns
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
    // Conjunctions
    "and",
    "or",
    "but",
    "so",
    "yet",
    "nor",
    "for",
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
    // Common auxiliary verbs
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
    // Other common function words
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
    "so",
    "too",
    "also",
    "just",
    "only",
    "still",
    "already",
    "yet",
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
  ];

  const words = selectedText
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 0 && !utilityWords.includes(word));

  if (words.length > 9) {
    return ` Paraphrase using everyday simple language: "${selectedText}". Do not omit anything. Return just one sentence.`;
  }

  if (words.length > 2) {
    return `Selected: "${selectedText}". Context: "${context}". Paraphrase ONLY the selected part (not whole context) using different simple words. Do NOT add any details from the context that aren't in the selected.`;
  }

  if (words.length === 1){
    return `Context: "${context}" Give one general definition JUST for the word "${selectedText}" on its own (in isolation). Take into account slang.  Do not repeat the word. Use one consise sentence, everyday simple language, 18+ allowed.`;
  }

  if (words.length === 2){
    return ` Context: "${context}". Phrase: "${selectedText}". Give a definition for the phrase "${selectedText}" on its own.  Do not include "${selectedText}" itself into your final definition. Do not include into the definition details from the context which are not the part of the phrase. Use one laconic sentence, everyday simple language.`;
  }
}

// Function to build the follow-up prompt
function buildFollowupPrompt(
  originalSelection,
  lastAssistantMessage,
  userQuestion
) {
  return FOLLOWUP_PROMPT.replace(
    "{ORIGINAL_SELECTION}",
    originalSelection || ""
  )
    .replace("{LAST_ASSISTANT_MESSAGE}", lastAssistantMessage || "")
    .replace("{USER_QUESTION}", userQuestion || "");
}

// Export functions and constants
window.buildAnalysisPrompt = buildAnalysisPrompt;
window.buildFollowupPrompt = buildFollowupPrompt;
window.buildConversationPrompt = buildConversationPrompt;
window.FOLLOWUP_SYSTEM_PROMPT = FOLLOWUP_SYSTEM_PROMPT;
