/////////////////////////////////////////////////////////////
// == Global conversation history array ==
/////////////////////////////////////////////////////////////
let conversationHistory = [];

// == LLM Provider Configuration ==
// Current LLM provider: 'openai', 'local', or 'gemini'
let currentLLMProvider = globalThis.GEM_CONFIG?.defaultProvider || 'openai';

// == Movie Mode Configuration ==
// When enabled, prompts are optimized for movie subtitles
let movieModeEnabled = false;

// == Context Configuration ==
// Number of sentences to extract (current + previous sentences)
let sentenceContextCount = 1;

function ensureSelectedText(selectedText, isFollowUp) {
  if (!selectedText.trim() && !isFollowUp) {
    throw new Error("Empty selected text provided");
  }
}

function beginConversationTurn({ selectedText, context, isFollowUp, promptProvider, includeSystemMessage }) {
  ensureSelectedText(selectedText, isFollowUp);

  if (isFollowUp) {
    conversationHistory.push({
      role: "user",
      content: selectedText,
    });
    return;
  }

  const initialPrompt = buildAnalysisPrompt(
    selectedText,
    context,
    promptProvider,
    movieModeEnabled
  );

  conversationHistory = [
    ...(includeSystemMessage ? [{
      role: "system",
      content: FOLLOWUP_SYSTEM_PROMPT,
    }] : []),
    {
      role: "user",
      content: initialPrompt,
    },
  ];
}

function appendAssistantReply(content) {
  conversationHistory.push({
    role: "assistant",
    content,
  });
}

function rollbackFollowUpTurn(isFollowUp) {
  if (isFollowUp && conversationHistory.length > 0) {
    conversationHistory.pop();
  }
}

function toPlainConversationMessages({ includeSystem = true } = {}) {
  return conversationHistory
    .filter((msg) => includeSystem || msg.role === "user" || msg.role === "assistant")
    .map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
}

// Wrapper function that routes to the appropriate LLM with fallback
async function analyzeText(selectedText, context, isFollowUp = false) {
  const originalProvider = currentLLMProvider;
  const providerHandlers = {
    openai: analyzeWithOpenAILLM,
    local: analyzeWithLocalLLM,
    gemini: analyzeWithGeminiLLM,
  };
  const fallbackOrder = {
    openai: ['local', 'gemini'],
    local: ['openai', 'gemini'],
    gemini: ['openai', 'local'],
  };
  
  try {
    const primaryHandler = providerHandlers[currentLLMProvider];
    if (!primaryHandler) {
      throw new Error(`Unknown LLM provider: ${currentLLMProvider}`);
    }
    return await primaryHandler(selectedText, context, isFollowUp);
  } catch (error) {
    console.warn(`${originalProvider} LLM failed, trying fallback:`, error);
    
    const fallbacks = fallbackOrder[originalProvider] || [];
    for (const fallbackProvider of fallbacks) {
      try {
        console.log(`Falling back to ${fallbackProvider} LLM`);
        return await providerHandlers[fallbackProvider](selectedText, context, isFollowUp);
      } catch (fallbackError) {
        console.error(`Fallback ${fallbackProvider} failed:`, fallbackError);
      }
    }

    throw new Error(`All LLM providers failed. Primary provider: ${originalProvider}. Primary error: ${error.message}`);
  }
}
