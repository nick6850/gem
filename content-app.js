const POPUP_VIEWPORT_MARGIN = 20;
const PROVIDER_CYCLE = ['openai', 'local', 'gemini'];
let lastSelectedText = "";
let lastContextText = "";
let originalText = "";
let isLeftMouseDown = null;

function getCenteredPopupPosition() {
  const popupRect = popup.getBoundingClientRect();
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;
  const popupHeight = popupRect.height;
  const popupWidth = popupRect.width;

  const left = Math.max(
    POPUP_VIEWPORT_MARGIN,
    Math.min((viewportWidth - popupWidth) / 2, viewportWidth - popupWidth - POPUP_VIEWPORT_MARGIN)
  );
  const top = Math.max(
    POPUP_VIEWPORT_MARGIN,
    Math.min((viewportHeight - popupHeight) / 2, viewportHeight - popupHeight - POPUP_VIEWPORT_MARGIN)
  );

  return {
    left: Math.round(left),
    top: Math.round(top),
  };
}

function applyPopupPosition({ left, top }) {
  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;
}

function positionPopup() {
  popup.style.display = "block";
  popup.style.visibility = "hidden";
  overlay.style.display = "block";

  applyPopupPosition(getCenteredPopupPosition());
  popup.style.visibility = "visible";
  enableClickOutsideClose();
}

window.addEventListener('resize', () => {
  if (popup.style.display !== 'none') {
    applyPopupPosition(getCenteredPopupPosition());
  }
});

/////////////////////////////////////////////////////////////
// == Helper to position floating button near selection ==
/////////////////////////////////////////////////////////////
function positionButton(rect) {
  const buttonWidth = floatingButton.offsetWidth;
  const buttonHeight = floatingButton.offsetHeight;

  let left = rect.right + 5;
  let top = rect.top + rect.height / 2 - buttonHeight / 2;

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // Ensure the button doesn't go out of the viewport horizontally
  if (left + buttonWidth > viewportWidth) {
    left = rect.left - buttonWidth - 5;
  }
  if (left < 0) {
    left = 5; // Ensure it doesn't go off the left edge
  }

  // Ensure the button doesn't go out of the viewport vertically
  if (top + buttonHeight > viewportHeight) {
    top = rect.bottom - buttonHeight - 5;
  }
  if (top < 0) {
    top = 5; // Ensure it doesn't go off the top edge
  }

  floatingButton.style.left = `${left}px`;
  floatingButton.style.top = `${top}px`;
}

// Helper function to get context around selection inside the popup (shadow DOM)
function getContextFromPopupSelection() {
  // Use shadowRoot.getSelection() to get selection inside shadow DOM
  if (typeof shadowRoot.getSelection !== 'function') {
    return null;
  }
  
  const selection = shadowRoot.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }

  const selectedText = selection.toString().trim();
  if (!selectedText) {
    return null;
  }

  // Get all text content from the chat container
  const popupText = chatContainer.innerText || chatContainer.textContent || '';
  
  if (!popupText) {
    return {
      selectedText: selectedText,
      contextBefore: '',
      contextAfter: '',
      fullContext: selectedText
    };
  }

  // Find the selected text in the popup content
  const selectedIndex = popupText.indexOf(selectedText);
  
  if (selectedIndex === -1) {
    // If exact match not found, just return the selected text with minimal context
    return {
      selectedText: selectedText,
      contextBefore: '',
      contextAfter: '',
      fullContext: selectedText
    };
  }

  // Extract words around the selection (similar to extractWordBasedContext)
  const windowSize = 15; // Number of words before and after
  
  // Get text before and after selection
  const textBefore = popupText.substring(0, selectedIndex);
  const textAfter = popupText.substring(selectedIndex + selectedText.length);
  
  // Split into words and get context
  const wordsBefore = textBefore.trim().split(/\s+/).filter(w => w);
  const wordsAfter = textAfter.trim().split(/\s+/).filter(w => w);
  
  const contextBefore = wordsBefore.slice(-windowSize).join(' ');
  const contextAfter = wordsAfter.slice(0, windowSize).join(' ');
  
  const fullContext = [contextBefore, selectedText, contextAfter]
    .filter(s => s)
    .join(' ');

  return {
    selectedText: selectedText,
    contextBefore: contextBefore,
    contextAfter: contextAfter,
    fullContext: fullContext
  };
}

// Local LLM integration - function loaded from localLLM.js

/////////////////////////////////////////////////////////////
// == Capture user's text selection, now with full page text
/////////////////////////////////////////////////////////////
document.addEventListener("selectionchange", () => {
  // Don't process selection changes while user is actively selecting (mouse is down)
  // This prevents DOM manipulation from interfering with the selection process
  if (isLeftMouseDown) {
    return;
  }

  const selection = window.getSelection();
  const selectedText = selection.toString().trim();

  if (selectedText) {
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    // Get clean selected text and context separately
    const { selectedText: cleanSelected, fullContext: context } = getContextAroundSelection();

    // Clear conversation history for new text selection
    if (originalText && originalText !== cleanSelected) {
      conversationHistory = [];
    }

    // Store both for the LLM call
    lastSelectedText = cleanSelected;
    lastContextText = context;
    originalText = cleanSelected;

    positionButton(rect);

    // Delay showing the button in case the user is still dragging
    setTimeout(() => {
      if (!isLeftMouseDown) {
        floatingButton.style.display = "flex";
      }
    }, 500);
  }
});

function playTTS(text) {
  chrome.runtime.sendMessage({ action: "playTTS", text });
}

function getShortcutSelection() {
  if (typeof shadowRoot.getSelection === 'function') {
    const shadowSelection = shadowRoot.getSelection();
    if (shadowSelection && shadowSelection.rangeCount > 0 && shadowSelection.toString().trim()) {
      return {
        text: shadowSelection.toString().trim(),
        source: "popup",
      };
    }
  }

  const documentSelection = window.getSelection();
  if (documentSelection && documentSelection.rangeCount > 0 && documentSelection.toString().trim()) {
    return {
      text: documentSelection.toString().trim(),
      source: "document",
    };
  }

  if (originalText) {
    return {
      text: originalText,
      source: "cached",
    };
  }

  return null;
}

function storeShortcutSelection(selection) {
  if (selection.source === "cached") {
    return;
  }

  lastSelectedText = selection.text;
  originalText = selection.text;

  if (selection.source === "popup") {
    const popupContext = getContextFromPopupSelection();
    if (popupContext) {
      lastContextText = popupContext.fullContext;
    }
    return;
  }

  const contextData = getContextAroundSelection();
  lastContextText = contextData.fullContext;
}

function buildQuickPromptText(aiPrompt) {
  return aiPrompt.includes("${selectedText}")
    ? aiPrompt.replace("${selectedText}", lastSelectedText)
    : aiPrompt;
}

async function handleQuickPrompt({ userMessage, aiPrompt, errorContext }) {
  if (!originalText) {
    return;
  }

  addMessage(userMessage, false);

  const thinkingMessage = addMessage("Typing...", true);
  if (thinkingMessage && thinkingMessage.classList) {
    thinkingMessage.classList.add("thinking");
  }

  try {
    const response = await analyzeText(buildQuickPromptText(aiPrompt), "", true);
    chatContainer.removeChild(thinkingMessage);
    addMessage(response, true);
  } catch (error) {
    chatContainer.removeChild(thinkingMessage);
    addMessage("Error communicating with the service.", true);
    console.error(`${errorContext} error:`, error);
  }
}

function bindQuickPromptHandlers() {
  QUICK_PROMPTS.forEach((prompt) => {
    quickPromptButtons.get(prompt.label)?.addEventListener("click", () => {
      handleQuickPrompt(prompt);
    });
  });
}

async function startAnalysisSession({ logConversation = false } = {}) {
  if (!originalText) {
    return;
  }

  chatContainer.innerHTML = "";
  conversationHistory = [];
  addMessage("Analyzing...", true);
  positionPopup();
  floatingButton.style.display = "none";

  try {
    console.log("Sending API request for selectedText:", lastSelectedText, "context:", lastContextText);
    const analysis = await analyzeText(lastSelectedText, lastContextText.replace(/<<<SELECTED>>>|<<<\/SELECTED>>>/g, ""));
    console.log("Received analysis:", analysis);

    if (popup.style.display === "none") {
      return;
    }

    chatContainer.innerHTML = "";
    addMessage(originalText, false);
    addMessage(analysis, true);

    if (logConversation) {
      console.log("✅ Initial analysis complete. conversationHistory:", JSON.stringify(conversationHistory, null, 2));
    }

    positionPopup();
  } catch (error) {
    if (popup.style.display !== "none") {
      chatContainer.innerHTML = "";
      addMessage("Error: Could not analyze text. Please try again.", true);
    }
    console.error("Analysis error:", error);
  }
}

function hasCommandModifier(event) {
  return event.ctrlKey || event.metaKey;
}

function cycleProvider() {
  const currentIndex = PROVIDER_CYCLE.indexOf(currentLLMProvider);
  const newProvider = PROVIDER_CYCLE[(currentIndex + 1) % PROVIDER_CYCLE.length];
  setLLMProvider(newProvider);

  console.log(`🔄 Keyboard shortcut activated - switching to ${newProvider.toUpperCase()}`);
}

function toggleMovieMode() {
  movieModeEnabled = !movieModeEnabled;
  showMovieModeNotification(movieModeEnabled);

  console.log(`🎬 Movie mode ${movieModeEnabled ? 'ENABLED' : 'DISABLED'}`);
}

async function handleAnalyzeShortcut(event) {
  event.preventDefault();
  event.stopPropagation();

  const selection = getShortcutSelection();
  if (selection) {
    storeShortcutSelection(selection);
    await startAnalysisSession({ logConversation: true });
  }
}

document.addEventListener("keydown", async (event) => {
  if ((event.ctrlKey && event.key === "z") || (hasCommandModifier(event) && event.key === "b")) {
    await handleAnalyzeShortcut(event);
    return;
  }

  if (hasCommandModifier(event) && event.key === '1') {
    event.preventDefault();
    event.stopPropagation();
    cycleProvider();
    return;
  }
  
  if (hasCommandModifier(event) && event.key === '2') {
    event.preventDefault();
    event.stopPropagation();
    toggleMovieMode();
  }
});

/////////////////////////////////////////////////////////////
// == Floating button click (start new popup)
/////////////////////////////////////////////////////////////
floatingButton.addEventListener("click", async (e) => {
  e.preventDefault();
  e.stopPropagation();
  await startAnalysisSession();
});

document.addEventListener("mousedown", (e) => {
  if (e.button === 0) {
    isLeftMouseDown = true;
  }
});

document.addEventListener("mouseup", (e) => {
  if (e.button === 0) {
    isLeftMouseDown = false;
  }
});

/////////////////////////////////////////////////////////////
// == Handle user follow-up questions ==
/////////////////////////////////////////////////////////////
async function handleUserInput() {
  const userQuestion = input.value.trim();
  if (!userQuestion) return;

  // Debug: log conversation history before follow-up
  console.log("📝 Follow-up requested. Current conversationHistory:", JSON.stringify(conversationHistory, null, 2));

  // Show user question in chat
  addMessage(userQuestion, false);
  input.value = "";

  // Show a "Thinking..." message for follow-up
  const thinkingMessage = addMessage("Typing...", true);
  // make the temporary thinking message smaller than normal messages
  if (thinkingMessage && thinkingMessage.classList) {
    thinkingMessage.classList.add("thinking");
  }

  try {
    const response = await analyzeText(userQuestion, "", true);

    // Remove "Thinking..." bubble
    chatContainer.removeChild(thinkingMessage);

    // Show AI response
    addMessage(response, true);
  } catch (error) {
    chatContainer.removeChild(thinkingMessage);
    addMessage("Error communicating with the service.", true);
    console.error("Follow-up error:", error);
  }
}

input.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    handleUserInput();
  }
});

bindQuickPromptHandlers();

/////////////////////////////////////////////////////////////
// == Close popup when clicking outside or hide button ==
/////////////////////////////////////////////////////////////

// Handle clicks on floating button visibility
// Use normal event phase (not capture) to avoid interfering with page interactions
document.addEventListener("click", (event) => {
  // If click is not on the floating button, hide it (only when popup is closed)
  if (popup.style.display !== "block" && !floatingButton.contains(event.target)) {
    floatingButton.style.display = "none";
  }
});
