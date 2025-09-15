/////////////////////////////////////////////////////////////
// == Global conversation history array ==
/////////////////////////////////////////////////////////////
let conversationHistory = [];

// == LLM Provider Configuration ==
// Current LLM provider: 'local' or 'gemini'
let currentLLMProvider = 'local';


// Wrapper function that routes to the appropriate LLM
async function analyzeText(selectedText, context, isFollowUp = false) {
  if (currentLLMProvider === 'local') {
    return await analyzeWithLocalLLM(selectedText, context, isFollowUp);
  } else if (currentLLMProvider === 'gemini') {
    return await analyzeWithGeminiLLM(selectedText, context, isFollowUp);
  } else {
    throw new Error(`Unknown LLM provider: ${currentLLMProvider}`);
  }
}

function getContextAroundSelection() {
  // Get the trimmed inner text of the entire document body
  // For PDFs, try multiple approaches to get text
  let pageText = '';
  
  // Try PDF.js text layer first (most common PDF viewer)
  const pdfTextLayers = document.querySelectorAll('.textLayer');
  if (pdfTextLayers.length > 0) {
    pageText = Array.from(pdfTextLayers)
      .map(layer => layer.innerText || layer.textContent)
      .join(' ')
      .trim();
  }
  
  // Fallback to document body for regular pages and other PDF viewers
  if (!pageText && document.body) {
    pageText = document.body.innerText.trim();
  }
  
  // Final fallback to document text content
  if (!pageText) {
    pageText = document.documentElement.textContent.trim();
  }

  // Get the current text selection
  const selection = window.getSelection();

  // Check if there is at least one range in the selection
  if (selection.rangeCount) {
    // Get the first range of the selection
    const range = selection.getRangeAt(0);
    const selectedText = range.toString().trim();

    // Proceed only if there is selected text
    if (selectedText) {
      // Create start and end marker elements with essential spaces
      const markerStart = document.createElement("span");
      markerStart.textContent = " <<<SELECTED>>> ";

      const markerEnd = document.createElement("span");
      markerEnd.textContent = " <<</SELECTED>>> ";

      // Clone the range to avoid modifying the original selection
      const startRange = range.cloneRange();
      const endRange = range.cloneRange();

      // Insert the start marker at the beginning of the selection
      startRange.collapse(true); // Collapse to the start of the range
      startRange.insertNode(markerStart);

      // Insert the end marker at the end of the selection
      endRange.collapse(false); // Collapse to the end of the range
      endRange.insertNode(markerEnd);

      // Update the pageText to include the markers
      pageText = document.body.innerText.trim();

      // Remove the markers from the DOM to clean up
      markerStart.remove();
      markerEnd.remove();

      // Split the page text into an array of words
      const pageTextWords = pageText.split(/\s+/);

      // Find the indices of the start and end markers
      const startMarkerIndex = pageTextWords.indexOf("<<<SELECTED>>>");
      const finishMarkerIndex = pageTextWords.indexOf("<<</SELECTED>>>");

      // Define the number of words to include before and after the selection
      const windowSize = currentLLMProvider === 'local' ? 10 : 150;

      // Calculate the start and end indices for slicing, ensuring they stay within bounds
      const start = Math.max(startMarkerIndex - windowSize, 0);
      const end = Math.min(
        finishMarkerIndex + windowSize,
        pageTextWords.length
      );

      // Extract context before, selected text, and context after
      const contextBefore = pageTextWords.slice(start, startMarkerIndex).join(" ");
      const contextAfter = pageTextWords.slice(finishMarkerIndex + 1, end).join(" ");

      // Extract the final text window around the selection
      const fullContext = pageTextWords.slice(start, end).join(" ");

      // Return object with separate components
      return {
        selectedText: selectedText,
        contextBefore: contextBefore,
        contextAfter: contextAfter,
        fullContext: fullContext
      };
    }
  }

  // If there is no selection, return object with full page text
  return {
    selectedText: "",
    contextBefore: "",
    contextAfter: "",
    fullContext: pageText
  };
}

// Inject custom scrollbar styling and set consistent font size
const style = document.createElement("style");
style.innerHTML = `
  .my-ai-helper-extension, .my-ai-helper-extension * {
      box-sizing: content-box !important;
  }

  .chat-container::-webkit-scrollbar {
      width: 6px !important;
  }
  .chat-container::-webkit-scrollbar-track {
      background: transparent !important;
  }
  .chat-container::-webkit-scrollbar-thumb {
      background-color: #aaa !important;
      border-radius: 3px !important;
      border: none !important;
  }
  .chat-container {
      scrollbar-width: thin !important;
      scrollbar-color: #aaa transparent !important;
      font-size: 13.5px !important; 
      font-family: ui-sans-serif !important; 
  }

  .popup {
      font-size: 13.5px !important;
      font-family: ui-sans-serif; !important;
  }

  .input-container input,
  .input-container button {
      font-size: 13.5px !important; 
      display: flex;
      align-items: center;
  }

  .message, .message.ai, .message.user {
      font-size: 13.5px !important;
  }

  .message.thinking {
      font-size: 13.5px !important;
  }
`;
document.head.appendChild(style);

// YouTube subtitle selection fix
if (window.location.hostname.includes('youtube.com') || window.location.hostname.includes('youtu.be')) {
  // Add CSS to make subtitles selectable
  const subtitleStyle = document.createElement('style');
  subtitleStyle.innerHTML = `
    /* Target subtitle containers and text elements */
    .ytp-caption-window-container,
    .ytp-caption-segment,
    .caption-visual-line,
    .ytp-caption-window-container * {
      user-select: text !important;
      -webkit-user-select: text !important;
      -moz-user-select: text !important;
      -ms-user-select: text !important;
      cursor: text !important;
    }

    /* Prevent dragging and other pointer events that interfere with selection */
    .ytp-caption-window-container {
      pointer-events: none !important;
    }

    /* Re-enable pointer events for text selection */
    .ytp-caption-window-container * {
      pointer-events: auto !important;
    }

    /* Specific targeting for subtitle text spans */
    .ytp-caption-segment span,
    .caption-visual-line span,
    .ytp-caption-text {
      user-select: text !important;
      pointer-events: auto !important;
      cursor: text !important;
      -webkit-user-select: text !important;
      -moz-user-select: text !important;
      -ms-user-select: text !important;
    }

    /* Prevent any dragging behavior */
    .ytp-caption-window-container,
    .ytp-caption-segment,
    .caption-visual-line {
      -webkit-user-drag: none !important;
      -moz-user-drag: none !important;
      user-drag: none !important;
      touch-action: manipulation !important;
    }
  `;
  document.head.appendChild(subtitleStyle);

  // Watch for dynamically added subtitle elements
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) { // Element node
          const element = node;
          if (element.classList && (
            element.classList.contains('ytp-caption-segment') ||
            element.classList.contains('caption-visual-line') ||
            element.closest('.ytp-caption-window-container')
          )) {
            element.style.userSelect = 'text';
            element.style.pointerEvents = 'auto';
            element.style.webkitUserSelect = 'text';

            // Add event listeners to prevent dragging
            element.addEventListener('mousedown', preventDrag, true);
            element.addEventListener('mousemove', preventDrag, true);
            element.addEventListener('dragstart', preventDrag, true);
          }
        }
      });
    });
  });

  // Function to prevent dragging behavior
  function preventDrag(e) {
    if (e.type === 'dragstart') {
      e.preventDefault();
      return false;
    }
    // Only prevent default for mouse events that might cause dragging
    if (e.type === 'mousedown' && e.button !== 0) {
      return; // Allow right-click
    }
    // Prevent the event from bubbling up to parent elements
    e.stopPropagation();
  }

  // Add global event handlers to subtitle containers
  function setupSubtitleEventHandlers() {
    const subtitleContainers = document.querySelectorAll('.ytp-caption-window-container, .ytp-caption-segment, .caption-visual-line');
    subtitleContainers.forEach(container => {
      container.addEventListener('mousedown', preventDrag, true);
      container.addEventListener('mousemove', preventDrag, true);
      container.addEventListener('dragstart', preventDrag, true);
      container.addEventListener('selectstart', (e) => e.stopPropagation(), true);
    });
  }

  // Initial setup
  setupSubtitleEventHandlers();

  // Start observing changes to the document body
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // Re-setup handlers when new content loads
  setInterval(setupSubtitleEventHandlers, 1000);
}

// Create a floating button element
const floatingButton = document.createElement("div");
// ADDED a unique scoping class 'my-ai-helper-extension'
floatingButton.className = "floating-button my-ai-helper-extension";
floatingButton.style.cssText = `
  position: absolute !important;
  width: 30px !important; 
  height: 30px !important;
  background: #4285f4 !important;
  border-radius: 50% !important;
  cursor: pointer !important;
  display: none !important;
  z-index: 10000 !important;
  box-shadow: 0 2px 5px rgba(0,0,0,0.2) !important;
  transition: transform 0.2s !important;
  justify-content: center !important;
  align-items: center !important;
  font-size: 20px !important;
  color: white !important;
`;
floatingButton.innerHTML = "?";
floatingButton.addEventListener("mouseenter", () => {
  floatingButton.style.transform = "scale(1.1)";
});
floatingButton.addEventListener("mouseleave", () => {
  floatingButton.style.transform = "scale(1)";
});

//commented out since i use shortcut to open the popup for now
// document.body.appendChild(floatingButton);


// Create notification element for provider switching
const notificationDiv = document.createElement("div");
notificationDiv.className = "provider-notification my-ai-helper-extension";
notificationDiv.style.cssText = `
  position: fixed !important;
  top: 50% !important;
  left: 50% !important;
  transform: translate(-50%, -50%) !important;
  background: rgba(0, 0, 0, 0.9) !important;
  color: white !important;
  padding: 16px 24px !important;
  border-radius: 8px !important;
  font-size: 16px !important;
  font-weight: 500 !important;
  z-index: 10002 !important;
  display: none !important;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3) !important;
  border: 2px solid #4285f4 !important;
`;

// Function to show notification
function showProviderNotification(provider) {
  const providerName = provider === 'local' ? 'Local LLM' : 'Gemini AI';
  const color = provider === 'local' ? '#ff6b35' : '#4285f4';
  const emoji = provider === 'local' ? '🏠' : '🤖';

  notificationDiv.innerHTML = `${emoji} Switched to ${providerName}`;
  notificationDiv.style.borderColor = color;
  notificationDiv.style.display = 'block';

  // Hide after 2 seconds
  setTimeout(() => {
    notificationDiv.style.display = 'none';
  }, 2000);
}

// Initialize notification
document.body.appendChild(notificationDiv);

// Make setLLMProvider function available globally
window.setLLMProvider = function(provider) {
  if (provider === 'local' || provider === 'gemini') {
    currentLLMProvider = provider;
    console.log(`✅ Switched to ${provider.toUpperCase()} LLM provider`);
    console.log(`💡 Switch providers: Ctrl/Cmd+Shift+P or use setLLMProvider('local'/'gemini')`);

    // Show notification
    showProviderNotification(provider);
  } else {
    console.error(`❌ Invalid provider: ${provider}. Use 'local' or 'gemini'`);
  }
};

// Create a popup element
const popup = document.createElement("div");
// ADDED a unique scoping class 'my-ai-helper-extension'
popup.className = "popup my-ai-helper-extension";
popup.style.cssText = `
  position: absolute !important;
  padding: 20px !important;
  background: white !important; 
  font-size: 13.5px !important;
  line-height: 1.5 !important;
  border: 1px solid #e0e0e0 !important;
  border-radius: 8px !important;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15) !important;
  width: 270px !important;
  z-index: 999 !important; 
  display: none !important;
  color: #333 !important;
  overflow: auto !important;
  max-height: 80vh !important;
  text-align: left !important;
  -webkit-font-smoothing: antialiased !important;
`;

// Create chat container
const chatContainer = document.createElement("div");
chatContainer.className = "chat-container";
chatContainer.style.cssText = `
  overflow-y: auto !important;
  max-height: 250px !important;
  line-height: 1.5 !important;
  -webkit-font-smoothing: antialiased !important;
`;
popup.appendChild(chatContainer);

// Create quick prompts container
const quickPromptsContainer = document.createElement("div");

quickPromptsContainer.style.cssText = `
  display: flex !important;
  justify-content: end !important;
  margin-top: 5px !important;
  gap: 5px !important;
`;

const ruButton = document.createElement("button");
ruButton.textContent = "RU";
ruButton.style.cssText = `
  font-size: 9px !important;
  color: rgb(76 75 75) !important;
  cursor: pointer !important;
  border: none !important;
  background: none !important;
  padding: 0 !important;
`;




const simplifyButton = document.createElement("button");
simplifyButton.textContent = "Simplify";
simplifyButton.style.cssText = `
  font-size: 9px !important;
  color: rgb(76 75 75) !important;
  cursor: pointer !important;
  border: none !important;
  background: none !important;
    padding: 0 !important;
`;

const shortifyButton = document.createElement("button");
shortifyButton.textContent = "Shortify";
shortifyButton.style.cssText = `
  font-size: 9px !important;
  color: rgb(76 75 75) !important;
  cursor: pointer !important;
  border: none !important;
  background: none !important;
    padding: 0 !important;
`;

const culturalBackgroundButton = document.createElement("button");
culturalBackgroundButton.textContent = "Culture";
culturalBackgroundButton.style.cssText = `
  font-size: 9px !important;
  color: rgb(76 75 75) !important;
  cursor: pointer !important;
  border: none !important;
  background: none !important;
    padding: 0 !important;
`;


// Helper function to create quick prompt callbacks
function createQuickPromptCallback(userMessage, aiPrompt, errorContext) {
  return async () => {
    if (originalText) {
      // Show user request in chat
      addMessage(userMessage, false);
      
      // Show "Typing..." message
      const thinkingMessage = addMessage("Typing...", true);
      if (thinkingMessage && thinkingMessage.classList) {
        thinkingMessage.classList.add("thinking");
      }
      
      try {
        const response = await analyzeText(aiPrompt, "", true);
        
        // Remove "Typing..." bubble
        chatContainer.removeChild(thinkingMessage);
        
        // Show AI response
        addMessage(response, true);
      } catch (error) {
        chatContainer.removeChild(thinkingMessage);
        addMessage("Error communicating with the service.", true);
        console.error(`${errorContext} error:`, error);
      }
    }
  };
}

// Add click handlers using the helper function
ruButton.addEventListener("click", createQuickPromptCallback(
  "Translate to Russian",
  "Translate inital user text to good everyday natural Russian. Answer in Russian only without extra comments.",
  "Russian translation"
));

shortifyButton.addEventListener("click", createQuickPromptCallback(
  "Make it shorter",
  "A little shorter",
  "Shortify text"
));

culturalBackgroundButton.addEventListener("click", createQuickPromptCallback(
  "Explain cultural background",
  "Explain why exactly it means that. Where does it come from? Keep it concise and to the point.",
  "Cultural background"
));

simplifyButton.addEventListener("click", createQuickPromptCallback(
  "Explain in simpler terms",
  "Explain this in simpler, easier to understand terms. No metaphors",
  "Simpler explanation"
));

quickPromptsContainer.appendChild(ruButton);
quickPromptsContainer.appendChild(culturalBackgroundButton);
quickPromptsContainer.appendChild(shortifyButton);
quickPromptsContainer.appendChild(simplifyButton);
popup.appendChild(quickPromptsContainer);

// Create input container
const inputContainer = document.createElement("div");
inputContainer.className = "input-container";
inputContainer.style.cssText = `
  display: flex !important;
  gap: 8px !important;
  color: black !important;
  text-align: left !important;
`;

const input = document.createElement("input");
input.placeholder = "Ask a follow-up question...";
input.style.cssText = `
  flex: 1 !important;
  padding: 8px !important;
  border: 1px solid #e0e0e0 !important;
  border-radius: 4px !important;
  background-color: white !important;
  font-size: 13px !important;
  color: black !important;
  text-align: left !important;
  height: 15px;
`;

inputContainer.appendChild(input);
popup.appendChild(inputContainer);
document.body.appendChild(popup);

/////////////////////////////////////////////////////////////
// == Helper to add a message to the chat window ==
/////////////////////////////////////////////////////////////
function addMessage(text, isAI = false) {
  const messageDiv = document.createElement("div");
  messageDiv.className = `message ${isAI ? "ai" : "user"}`;
  messageDiv.style.cssText = `
    margin-top: 10px !important;
    padding: 9px 12px !important;
    border-radius: 8px !important;
    max-width: 89% !important;
    word-wrap: break-word !important;
    position: relative !important;
    margin-right: 5px;
    ${
      isAI
        ? `
      background: #f8f9fa !important;
      margin-right: auto !important;
    `
        : `
      background: #e3f2fd !important;
      margin-left: auto !important;
    `
    }
  `;
  const formattedText = text
    // First escape HTML tags so they display as plain text
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // Then apply markdown formatting
    .replace(/\*\*(.*?)\*\*|__(.*?)__/gs, "<strong>$1$2</strong>")
    .replace(/\*(.*?)\*|_(.*?)_/gs, "<em>$1$2</em>")
    // Format code blocks with triple backticks
    .replace(/```([^`]+)```/gs, '<pre style="background: #f0f0f0; padding: 8px; border-radius: 4px; font-family: monospace; font-size: 0.9em; white-space: pre-wrap; margin: 4px 0;">$1</pre>')
    // Format inline code with single backticks
    .replace(/`([^`]+)`/g, '<code style="background: #f0f0f0; padding: 2px 4px; border-radius: 3px; font-family: monospace; font-size: 0.9em;">$1</code>')
    // Remove empty newlines but keep a break line before the second part
    .replace(/\n{2,}/g, "\n") // Remove extra newlines (more than one in a row)
    .replace(/\n/g, "<br>"); // Replace single newlines with <br> for the necessary breaks

  messageDiv.innerHTML = formattedText;

  // Add play icon to user messages in bottom right corner
  if (!isAI) {
    const playIcon = document.createElement("div");
    playIcon.style.cssText = `
      position: absolute !important;
      bottom: 4px !important;
      right: 7px !important;
      cursor: pointer !important;
      z-index: 1 !important;
      height: 12px !important;
      width: 12px !important;
    `;
    playIcon.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="12" fill="#4285f4"/>
        <polygon points="10,8 16,12 10,16" fill="white"/>
      </svg>
    `;
    playIcon.addEventListener("click", (e) => {
      e.stopPropagation();
      playTTS(text);
    });
    messageDiv.appendChild(playIcon);
  }

  chatContainer.appendChild(messageDiv);

  // If it's an AI message, focus on the last message's beginning, a bit higher
  if (isAI) {
    setTimeout(() => {
      const lastMessage = chatContainer.lastElementChild;
      // Scroll a little higher than the top of the last message
      chatContainer.scrollTop = lastMessage.offsetTop - 150; // Adjust the "150" value to fine-tune
    }, 100); // Small delay to ensure rendering
  } else {
    // For user messages, scroll to the bottom
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }

  return messageDiv;
}

/////////////////////////////////////////////////////////////
// == Helper to center the popup (currently used in code) ==
/////////////////////////////////////////////////////////////
function positionPopup() {
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;
  const popupHeight = popup.offsetHeight;
  const popupWidth = popup.offsetWidth;

  // Calculate the center position
  const left = window.scrollX + (viewportWidth - popupWidth) / 2;
  const top = window.scrollY + (viewportHeight - popupHeight) / 2;

  // Set the popup's position
  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;
  popup.style.display = "block";
}

/////////////////////////////////////////////////////////////
// == Helper to position floating button near selection ==
/////////////////////////////////////////////////////////////
function positionButton(rect) {
  const buttonWidth = floatingButton.offsetWidth;
  const buttonHeight = floatingButton.offsetHeight;
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;

  let left = rect.right + scrollX + 5;
  let top = rect.top + scrollY + rect.height / 2 - buttonHeight / 2;

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // Ensure the button doesn't go out of the viewport horizontally
  if (left + buttonWidth > viewportWidth + scrollX) {
    left = rect.left + scrollX - buttonWidth - 5;
  }
  if (left < scrollX) {
    left = scrollX + 5; // Ensure it doesn't go off the left edge
  }

  // Ensure the button doesn't go out of the viewport vertically
  if (top + buttonHeight > viewportHeight + scrollY) {
    top = rect.bottom + scrollY - buttonHeight - 5;
  }
  if (top < scrollY) {
    top = scrollY + 5; // Ensure it doesn't go off the top edge
  }

  floatingButton.style.left = `${left}px`;
  floatingButton.style.top = `${top}px`;
}

let lastSelectedText = "";
let lastContextText = "";
let originalText = "";

// Local LLM integration - function loaded from localLLM.js

/////////////////////////////////////////////////////////////
// == Capture user's text selection, now with full page text
/////////////////////////////////////////////////////////////
document.addEventListener("selectionchange", () => {
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

// == Helper to add a play icon above the AI answer ==
function addPlayIcon(textToRead) {
  const playDiv = document.createElement("div");
  playDiv.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: flex-end;
    margin-bottom: 4px;
    cursor: pointer;
    width: 100%;
  `;
  playDiv.innerHTML = `
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align: middle;">
      <circle cx="12" cy="12" r="12" fill="#4285f4"/>
      <polygon points="10,8 16,12 10,16" fill="white"/>
    </svg>
  `;
  playDiv.addEventListener("click", (e) => {
    e.stopPropagation();
    playTTS(textToRead);
  });
  return playDiv;
}

/////////////////////////////////////////////////////////////
// == Modify floatingButton and keyboard shortcuts logic to add play icon above AI answer ==
/////////////////////////////////////////////////////////////
document.addEventListener("keydown", async (e) => {
  // Check if Ctrl + Z or Cmd + B is pressed
  const isCtrlZ = e.ctrlKey && e.key === "z";
  const isCmdB = (e.metaKey || e.ctrlKey) && e.key === "b";

    if (isCtrlZ || isCmdB) {
      e.preventDefault();
      e.stopPropagation();

      if (originalText) {
        // Clear chat visually - keep conversation history for follow-ups
        chatContainer.innerHTML = "";
        // conversationHistory = []; // Keep history for follow-ups

      const buttonRect = floatingButton.getBoundingClientRect();
      const popupWidth = popup.offsetWidth;
      const popupHeight = popup.offsetHeight;
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;

      let left =
        buttonRect.left +
        window.scrollX -
        popupWidth / 2 +
        floatingButton.offsetWidth / 2;
      let top = buttonRect.bottom + window.scrollY + 10;

      if (left < 0) left = 10;
      else if (left + popupWidth > windowWidth) {
        left = windowWidth - popupWidth - 10;
      }
      if (top + popupHeight > windowHeight) {
        top = buttonRect.top + window.scrollY - popupHeight - 10;
      }

      popup.style.left = `${left}px`;
      popup.style.top = `${top}px`;
      popup.style.display = "block";

      // Always start fresh - no restoration between popup sessions
      chatContainer.innerHTML = "";
      conversationHistory = [];

      // Show "Analyzing..." bubble for new analysis
      addMessage("Analyzing...", true);
      positionPopup();
      floatingButton.style.display = "none";

      try {
        console.log("Sending API request for selectedText:", lastSelectedText, "context:", lastContextText);
        const analysis = await analyzeText(lastSelectedText, lastContextText.replace(/<<<SELECTED>>>|<<<\/SELECTED>>>/g, ""));
        console.log("Received analysis:", analysis);

        // === FIX ===
        // If the popup was closed while waiting for the API, do nothing.
        if (popup.style.display === "none") {
          return;
        }
        // === END FIX ===

        // Clear "Analyzing..." and show conversation
        chatContainer.innerHTML = "";

        addMessage(originalText, false);
        addMessage(analysis, true);

        positionPopup();
      } catch (error) {
        // Also check here so we don't show an error in a closed popup
        if (popup.style.display !== "none") {
          chatContainer.innerHTML = "";
          addMessage("Error: Could not analyze text. Please try again.", true);
        }
        console.error("Analysis error:", error);
      }
    }
  }
});

/////////////////////////////////////////////////////////////
// == Floating button click (start new popup)
/////////////////////////////////////////////////////////////
floatingButton.addEventListener("click", async (e) => {
  e.preventDefault();
  e.stopPropagation();

    if (originalText) {
      // Clear chat visually - keep conversation history for follow-ups
      chatContainer.innerHTML = "";
      // conversationHistory = []; // Keep history for follow-ups

    const buttonRect = floatingButton.getBoundingClientRect();
    const popupWidth = popup.offsetWidth;
    const popupHeight = popup.offsetHeight;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    let left =
      buttonRect.left +
      window.scrollX -
      popupWidth / 2 +
      floatingButton.offsetWidth / 2;
    let top = buttonRect.bottom + window.scrollY + 10;

    if (left < 0) left = 10;
    else if (left + popupWidth > windowWidth) {
      left = windowWidth - popupWidth - 10;
    }
    if (top + popupHeight > windowHeight) {
      top = buttonRect.top + window.scrollY - popupHeight - 10;
    }

    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
    popup.style.display = "block";

    // Always start fresh - no restoration between popup sessions
    chatContainer.innerHTML = "";
    conversationHistory = [];

    // Show "Analyzing..." bubble for new analysis
    addMessage("Analyzing...", true);
    positionPopup();
    floatingButton.style.display = "none";

    try {
      console.log("Sending API request for selectedText:", lastSelectedText, "context:", lastContextText);
      const analysis = await analyzeText(lastSelectedText, lastContextText.replace(/<<<SELECTED>>>|<<<\/SELECTED>>>/g, ""));
      console.log("Received analysis:", analysis);

        // === FIX ===
        // If the popup was closed while waiting for the API, do nothing.
        if (popup.style.display === "none") {
          return;
        }
        // === END FIX ===

      // Clear "Analyzing..." and show conversation
      chatContainer.innerHTML = "";

      addMessage(originalText, false);
      addMessage(analysis, true);

      positionPopup();
    } catch (error) {
      // Also check here so we don't show an error in a closed popup
      if (popup.style.display !== "none") {
        chatContainer.innerHTML = "";
        addMessage("Error: Could not analyze text. Please try again.", true);
      }
      console.error("Analysis error:", error);
    }
  }
});

/////////////////////////////////////////////////////////////
// == Track mouseDown to handle selection drag visually ==
/////////////////////////////////////////////////////////////
let isLeftMouseDown = null;

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

/////////////////////////////////////////////////////////////
// == Close popup when clicking outside or hide button ==
/////////////////////////////////////////////////////////////
document.addEventListener("click", (event) => {
  // If click is outside the popup & the button, close the popup
  if (!popup.contains(event.target) && !floatingButton.contains(event.target)) {
    popup.style.display = "none";
    // Clear conversation history when popup closes - no persistence
    conversationHistory = [];
  }

  // If click is not on the floating button, hide it
  if (!floatingButton.contains(event.target)) {
    floatingButton.style.display = "none";
  }
});

// Keyboard shortcut to switch LLM providers (Ctrl/Cmd + Shift + P)
document.addEventListener('keydown', function(event) {
  // Check for Ctrl+Shift+P or Cmd+Shift+P
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'P') {
    event.preventDefault();
    event.stopPropagation();

    // Switch to the other provider
    const newProvider = currentLLMProvider === 'local' ? 'gemini' : 'local';
    setLLMProvider(newProvider);

    console.log(`🔄 Keyboard shortcut activated - switching to ${newProvider.toUpperCase()}`);
  }
});
