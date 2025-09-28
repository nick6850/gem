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
const LOCAL_ANALYSIS_PROMPT = `Give a definition JUST to  as if it was STANDALONE. Short sentence, general language, 18+ allowed.`

// Concise system prompt for follow-ups
const FOLLOWUP_SYSTEM_PROMPT = `You are a helpful assistant analyzing text from webpages. Answer follow-up questions based on the conversation history. Keep responses concise and relevant.`;

// Function to build conversation history prompt
function buildConversationPrompt(conversationHistory, currentQuestion) {
  let prompt = "Conversation history:\n";

  conversationHistory.forEach((msg, index) => {
    if (msg.role === 'system') {
      // Skip system messages in the conversation history display
      return;
    } else if (msg.role === 'user' && index === 1) { // Index 1 because system is at index 0
      // Check if this is the initial user message with selected text and context
      if (msg.content.includes('Selected text:') && msg.content.includes('Context:')) {
        prompt += `User selected: ${msg.content}\n\n`;
      } else {
        prompt += `User selected: "${msg.content}"\n\n`;
      }
    } else if (msg.role === 'assistant') {
      prompt += `Assistant: ${msg.content}\n\n`;
    } else if (msg.role === 'user' && index > 1) {
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
function buildAnalysisPrompt(selectedText, context, provider = 'gemini') {
  context = context.replaceAll(/[\n"'""\\]/g, '').replaceAll(/\s+/g, ' ')

  // if (selectedText.split(' ').length > 9 ){
  //   return `Selected part: "${selectedText}". Paraphrase the selected part word by word. 18+ allowed. Return just paraphrased text.`
  // }
  
  if (selectedText.split(' ').length > 3 ){
    return `Context: "${context}". Selected part: "${selectedText}". Paraphrase the selected part in simpler terms. Try not to repeat words from the original. Focus ON the selected part ONLY. Never include context details in your paraphrasal. You must not reveal what the context was about. Natural and clear language (not techical or robot-like), 18+ allowed.`
  }
  
  return `Context: "${context}". Give a general definition ONLY to the word "${selectedText}" (as if it was standalone). Do not repeat it. Context is only for picking a suitable meaning. Never include context specifics in your definition. Your definition must not reveal what the context is about. Do not contaminate the definition with context details. Never interpret selected word as idiom unless entire idiom is selected. Short sentence, no verbosity, natural & clear language, 18+ allowed.`;
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
window.buildConversationPrompt = buildConversationPrompt;
window.FOLLOWUP_SYSTEM_PROMPT = FOLLOWUP_SYSTEM_PROMPT;
