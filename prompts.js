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
`
;

// Simple analysis prompt for local LLM  
 const LOCAL_ANALYSIS_PROMPT = `Context: "{CONTEXT}"
Selected: "{SELECTED_TEXT}"

ONLY output the answer. DO NOT repeat the selected text. NO labels like "Definition:" or "Context:". Start with capital letter. Use ONLY commas and periods. NO colons, semicolons, hyphens or dashes. Maximum 20 words, one paragraph, 1-2 sentences.

For words/phrases: give definition then context meaning.
For sentences: rephrase in simpler words.

Example:
Context: "A job came up and I thought about you."
Selected: "came up"
Output: Arose unexpectedly. Here it means a job became available.`;

// Alternative follow-up prompt for OpenAI-compatible APIs (system/user format)
const FOLLOWUP_SYSTEM_PROMPT = `You are a helpful assistant. Answer the user's follow-up question based on the preceding conversation. The conversation started with an analysis of a text selection from a webpage. Use your general knowledge if the context is insufficient, but do not state that the information is outside the provided context. Keep your answers concise (max 150 characters) and clear.`;

// Function to build the analysis prompt with selectedText and context
function buildAnalysisPrompt(selectedText, context, provider = 'gemini') {
  const prompt = provider === 'local' ? LOCAL_ANALYSIS_PROMPT : GEMINI_ANALYSIS_PROMPT;
  return prompt
    .replace('{SELECTED_TEXT}', selectedText)
    .replace('{CONTEXT}', context);
}

// Function to build the follow-up prompt
function buildFollowupPrompt(originalSelection, lastAssistantMessage, userQuestion) {
  return FOLLOWUP_PROMPT
    .replace('{ORIGINAL_SELECTION}', originalSelection || '')
    .replace('{LAST_ASSISTANT_MESSAGE}', lastAssistantMessage || '')
    .replace('{USER_QUESTION}', userQuestion || '');
}

// Export functions and constants
window.buildAnalysisPrompt = buildAnalysisPrompt;
window.buildFollowupPrompt = buildFollowupPrompt;
window.FOLLOWUP_SYSTEM_PROMPT = FOLLOWUP_SYSTEM_PROMPT;
