/////////////////////////////////////////////////////////////
// == Global conversation history array ==
/////////////////////////////////////////////////////////////
let conversationHistory = [];

// == LLM Provider Configuration ==
// Current LLM provider: 'local' or 'gemini'
let currentLLMProvider = 'local';

// == Context Configuration ==
// Number of sentences to extract (current + previous sentences)
let sentenceContextCount = 1;


// Wrapper function that routes to the appropriate LLM with fallback
async function analyzeText(selectedText, context, isFollowUp = false) {
  const originalProvider = currentLLMProvider;
  
  try {
    // Try the current LLM provider first
    if (currentLLMProvider === 'local') {
      return await analyzeWithLocalLLM(selectedText, context, isFollowUp);
    } else if (currentLLMProvider === 'gemini') {
      return await analyzeWithGeminiLLM(selectedText, context, isFollowUp);
    } else {
      throw new Error(`Unknown LLM provider: ${currentLLMProvider}`);
    }
  } catch (error) {
    console.warn(`${originalProvider} LLM failed, trying fallback:`, error);
    
    // Try the alternate LLM provider as fallback
    try {
      const fallbackProvider = originalProvider === 'local' ? 'gemini' : 'local';
      console.log(`Falling back to ${fallbackProvider} LLM`);
      
      if (fallbackProvider === 'local') {
        return await analyzeWithLocalLLM(selectedText, context, isFollowUp);
      } else {
        return await analyzeWithGeminiLLM(selectedText, context, isFollowUp);
      }
    } catch (fallbackError) {
      console.error(`Both LLM providers failed. Original error:`, error, `Fallback error:`, fallbackError);
      // Throw the original error since that was the primary attempt
      throw new Error(`Both ${originalProvider} and fallback LLM failed. Primary error: ${error.message}`);
    }
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
  
  // Special handling for YouTube to avoid navigation elements
  if (!pageText && (window.location.hostname.includes('youtube.com') || window.location.hostname.includes('youtu.be'))) {
    // Try to get text from main content areas, avoiding navigation
    const contentSelectors = [
      '#primary-inner', // Main content area
      '#secondary-inner', // Sidebar content
      '.ytd-watch-flexy', // Watch page content
      '#description', // Video description
      '.ytp-caption-window-container', // Subtitle container
      '.html5-video-container' // Video container area
    ];
    
    const contentElements = [];
    contentSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => contentElements.push(el));
    });
    
    if (contentElements.length > 0) {
      pageText = contentElements
        .map(el => el.innerText || el.textContent)
        .join(' ')
        .trim();
      
      // Filter out common YouTube navigation elements
      const navigationPatterns = [
        /Skip navigation/gi,
        /Create\s+\d+:\d+\s*\/\s*\d+:\d+/gi,
        /\d+:\d+\s*\/\s*\d+:\d+\s*\/\s*\d+:\d+\s+left/gi,
        /Subscribe\s+\d+/gi,
        /\d+\s+views/gi,
        /\d+\s+likes/gi,
        /Share\s+Download\s+Clip\s+Save/gi,
        /Comments\s+\d+/gi,
        /Sort by/gi,
        /Top comments/gi,
        /Newest first/gi
      ];
      
      navigationPatterns.forEach(pattern => {
        pageText = pageText.replace(pattern, '');
      });
      
      // Clean up extra whitespace
      pageText = pageText.replace(/\s+/g, ' ').trim();
    }
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
    // Better text extraction that adds spaces between different elements
    const selectedText = (() => {
      const contents = range.cloneContents();
      let text = '';
      
      function extractText(node) {
        if (node.nodeType === Node.TEXT_NODE) {
          text += node.textContent;
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          // Add space before each element (except first)
          if (text && !text.endsWith(' ')) {
            text += ' ';
          }
          for (let child of node.childNodes) {
            extractText(child);
          }
        }
      }
      
      for (let child of contents.childNodes) {
        extractText(child);
      }
      
      // Clean up whitespace but preserve single spaces between words
      return text.replace(/\s+/g, ' ').trim();
    })();

    // Proceed only if there is selected text
    if (selectedText) {
      // For YouTube subtitle selections, try to get context only from subtitle area
      const isYouTube = window.location.hostname.includes('youtube.com') || window.location.hostname.includes('youtu.be');
      const isSubtitleSelection = isYouTube && (
        range.commonAncestorContainer.closest?.('.ytp-caption-window-container') ||
        range.startContainer.parentElement?.closest?.('.ytp-caption-window-container') ||
        range.endContainer.parentElement?.closest?.('.ytp-caption-window-container')
      );

      if (isSubtitleSelection) {
        // For subtitle selections, use minimal context - just the subtitle text
        const subtitleContainer = document.querySelector('.ytp-caption-window-container');
        if (subtitleContainer) {
          pageText = subtitleContainer.innerText || subtitleContainer.textContent || '';
          // Clean up any remaining navigation elements
          pageText = pageText.replace(/Skip navigation/gi, '').replace(/Create\s+\d+:\d+/gi, '').trim();
        }
      }

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

      // Update the pageText to include the markers, but only if not already set for subtitles
      if (!isSubtitleSelection) {
        pageText = document.body.innerText.trim();
      } else {
        // For subtitle selections, re-get the text with markers
        const subtitleContainer = document.querySelector('.ytp-caption-window-container');
        if (subtitleContainer) {
          pageText = subtitleContainer.innerText || subtitleContainer.textContent || '';
        }
      }

      // Remove the markers from the DOM to clean up
      markerStart.remove();
      markerEnd.remove();

      // Try sentence-based context first
      const sentenceResult = tryExtractSentenceContext(pageText, selectedText);
      if (sentenceResult) {
        return sentenceResult;
      }

      // Fallback to word-based context (original method)
      return extractWordBasedContext(pageText, selectedText);
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

// Helper function to try extracting sentence-based context
function tryExtractSentenceContext(pageText, selectedText) {
  // Find the position of the selected text markers
  const startMarkerIndex = pageText.indexOf("<<<SELECTED>>>");
  const endMarkerIndex = pageText.indexOf("<<</SELECTED>>>");
  
  if (startMarkerIndex === -1 || endMarkerIndex === -1) {
    return null;
  }

  // Find the start of the current sentence (sentence containing the selection)
  let currentSentenceStart = 0;
  for (let i = startMarkerIndex - 1; i >= 0; i--) {
    const char = pageText[i];
    if (char === '.' || char === '!' || char === '?') {
      currentSentenceStart = i + 1;
      break;
    }
  }

  // Find the end of the current sentence
  let currentSentenceEnd = pageText.length;
  for (let i = endMarkerIndex; i < pageText.length; i++) {
    const char = pageText[i];
    if (char === '.' || char === '!' || char === '?') {
      currentSentenceEnd = i + 1;
      break;
    }
  }

  // Check if we need more sentences due to short context
  let actualSentenceCount = sentenceContextCount;
  if (sentenceContextCount === 1) {
    // For single sentence, check if it's too short and add one more before if needed
    const currentSentenceText = pageText.substring(currentSentenceStart, currentSentenceEnd).trim();
    const cleanCurrentSentence = currentSentenceText.replace(/<<<SELECTED>>>|<<<\/SELECTED>>>/g, '');
    const wordCount = cleanCurrentSentence.trim().split(/\s+/).length;
    
    if (wordCount <= 3) {
      actualSentenceCount = 2;
    }
  }

  // Find the start position for the desired number of sentences
  let contextStart = currentSentenceStart;
  
  if (actualSentenceCount > 1 && currentSentenceStart > 0) {
    // We need more than just the current sentence, find previous sentences
    let sentencesFound = 1; // We already have the current sentence
    let searchPosition = currentSentenceStart;
    
    while (sentencesFound < actualSentenceCount && searchPosition > 0) {
      // Look backwards to find the end of the previous sentence
      let foundSentenceEnd = false;
      for (let i = searchPosition - 1; i >= 0; i--) {
        const char = pageText[i];
        if (char === '.' || char === '!' || char === '?') {
          // Found end of a sentence, now find its start
          for (let j = i - 1; j >= 0; j--) {
            const prevChar = pageText[j];
            if (prevChar === '.' || prevChar === '!' || prevChar === '?') {
              // Found start of this sentence
              searchPosition = j + 1;
              sentencesFound++;
              foundSentenceEnd = true;
              break;
            }
          }
          if (!foundSentenceEnd) {
            // No previous sentence start found, use beginning of text
            searchPosition = 0;
            sentencesFound++;
            foundSentenceEnd = true;
          }
          break;
        }
      }
      if (!foundSentenceEnd) {
        // No more sentences found, stop
        break;
      }
    }
    
    contextStart = searchPosition;
  }

  // Extract context with the actual number of sentences
  const fullContext = pageText.substring(contextStart, currentSentenceEnd).trim();

  // Clean up markers from the context
  const cleanFullContext = fullContext.replace(/<<<SELECTED>>>|<<<\/SELECTED>>>/g, '');

  return {
    selectedText: selectedText,
    contextBefore: '',
    contextAfter: '',
    fullContext: cleanFullContext
  };
}

// Helper function for word-based context (original method)
function extractWordBasedContext(pageText, selectedText) {
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

    .caption-window {
      bottom: 0% !important;
    }

    .caption-window.ytp-caption-window-rollup {
      left: 36% !important;
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
  z-index: 10001 !important; 
  display: none !important;
  color: #333 !important;
  overflow: auto !important;
  max-height: 80vh !important;
  text-align: left !important;
  -webkit-font-smoothing: antialiased !important;
`;

// Create an overlay to block all page interactions when popup is open
const overlay = document.createElement("div");
overlay.className = "popup-overlay my-ai-helper-extension";
overlay.style.cssText = `
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  background: transparent !important;
  z-index: 10000 !important;
  display: none !important;
  pointer-events: auto !important;
`;
document.body.appendChild(overlay);

// Handle clicks on the overlay to close popup
overlay.addEventListener("click", (event) => {
  popup.style.display = "none";
  overlay.style.display = "none";
  conversationHistory = [];
});

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

// Helper function to create styled buttons
const createQuickPromptButton = (textContent) => {
  const button = document.createElement("button");
  button.textContent = textContent;
  button.style.cssText = `
    font-size: 9px !important;
    color: rgb(76 75 75) !important;
    cursor: pointer !important;
    border: none !important;
    background: none !important;
    padding: 0 !important;
    font-weight: 400 !important;
  `;
  return button;
};

const ruButton = createQuickPromptButton("RU");
const contextButton = createQuickPromptButton("Context");
const exampleButton = createQuickPromptButton("Example");
const expandButton = createQuickPromptButton("Expand");
const simplifyButton = createQuickPromptButton("Simplify");
const shortifyButton = createQuickPromptButton("Shortify");
const culturalBackgroundButton = createQuickPromptButton("Culture");
const originButton = createQuickPromptButton("Origin");


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
        // For prompts that need the selected text, replace the placeholder
        const finalPrompt = aiPrompt.includes("${selectedText}") 
          ? aiPrompt.replace("${selectedText}", lastSelectedText)
          : aiPrompt;
        
        const response = await analyzeText(finalPrompt, "", true);
        
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
  `Translate "\${selectedText}" into good everyday natural Russian. Just the russian translation, no extra comments.`,
  "Russian translation"
));

contextButton.addEventListener("click", createQuickPromptCallback(
  "What does it mean in this context?",
  "What does it mean in this context in 1 sentence?",
  "What does it mean in this context?"
))

exampleButton.addEventListener("click", createQuickPromptCallback(
  "Use it in a sentence",
  "I am an English learner. Create a sentence using the selected word to demonstrate it once more (like they do in dictionaries). Return just that sentence",
  "Use it in another sentence."
));

shortifyButton.addEventListener("click", createQuickPromptCallback(
  "Make it shorter",
  "A little shorter in 1 sentence",
  "Shortify text"
));


expandButton.addEventListener("click", createQuickPromptCallback(
  "Expand",
  "Give more info. Use 1 sentence.",
  "Expand"
));

culturalBackgroundButton.addEventListener("click", createQuickPromptCallback(
  "Explain cultural background",
  "Give short cultural and/or historical overview that would be interesting for me as an American. Use 1 sentence.",
  "Cultural background"
));

originButton.addEventListener("click", createQuickPromptCallback(
  "Why does it mean that?",
  "Why does it mean what it means? What does it originate from? In 1 sentence.",
  "Origin of the text"
));

simplifyButton.addEventListener("click", createQuickPromptCallback(
  "Explain in simpler terms",
  "Explain this in simpler, easier to understand terms. No metaphors. In 1 sentence.",
  "Simpler explanation"
));

quickPromptsContainer.appendChild(ruButton);
quickPromptsContainer.appendChild(contextButton);
quickPromptsContainer.appendChild(exampleButton);
quickPromptsContainer.appendChild(culturalBackgroundButton);
quickPromptsContainer.appendChild(originButton);
quickPromptsContainer.appendChild(shortifyButton);
quickPromptsContainer.appendChild(expandButton);
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
    // // First escape HTML tags so they display as plain text
    // .replace(/</g, "&lt;")
    // .replace(/>/g, "&gt;")
    // // Then apply markdown formatting
    // .replace(/\*\*(.*?)\*\*|__(.*?)__/gs, "<strong>$1$2</strong>")
    // .replace(/\*(.*?)\*|_(.*?)_/gs, "<em>$1$2</em>")
    // // Format code blocks with triple backticks
    // .replace(/```([^`]+)```/gs, '<pre style="background: #f0f0f0; padding: 8px; border-radius: 4px; font-family: monospace; font-size: 0.9em; white-space: pre-wrap; margin: 4px 0;">$1</pre>')
    // // Format inline code with single backticks
    // .replace(/`([^`]+)`/g, '<code style="background: #f0f0f0; padding: 2px 4px; border-radius: 3px; font-family: monospace; font-size: 0.9em;">$1</code>')
    // // Remove empty newlines but keep a break line before the second part
    // .replace(/\n{2,}/g, "\n") // Remove extra newlines (more than one in a row)
    // .replace(/\n/g, "<br>"); // Replace single newlines with <br> for the necessary breaks

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

// COMMENTED OUT: Helper to sanitize and keep only the first sentence from a text
// This function was cutting out all sentences after the first one in LLM responses
function removeSecondSentence(text) {
  try {
    // Normalize whitespace (including newlines) to single spaces
    let normalized = (text || '').replace(/\s+/g, ' ').trim();
    // Remove quotes but keep apostrophes
    normalized = normalized.replace(/["""«»„‟‹›]/g, '');
    // Remove any character that is not a letter, number, space, comma, period, apostrophe (straight and curly), semicolon, colon, question mark, exclamation mark, or dash (including unicode dashes)
    normalized = normalized.replace(/[^\p{L}\p{N}\s\.,'';:!?-]/gu, '');
    // Collapse spaces again after removals
    normalized = normalized.replace(/\s+/g, ' ').trim();

    // Look for sentence-ending patterns: period followed by space and capital letter
    const sentenceEndPattern = /\.\s+[A-Z]/;
    const match = normalized.match(sentenceEndPattern);
    
    let result;
    if (match) {
      const periodIndex = normalized.indexOf(match[0]);
      result = normalized.slice(0, periodIndex + 1);
    } else {
      // Fallback: return the whole text if no clear sentence boundary found
      result = normalized;
    }
    
    // Clean leading/trailing commas/spaces
    result = result.replace(/^[,\s]+/, '').replace(/[\s,]+$/, '');
    
    // Remove repetitive definition pattern (word: definition)
    const definitionPattern = /^[A-Za-z\s]+:\s*/;
    result = result.replace(definitionPattern, '').trim();
    
    // Handle semicolons: split, capitalize second part, replace with period
    if (result && result.includes(';')) {
      const parts = result.split(';');
      if (parts.length === 2) {
        const firstPart = parts[0].trim();
        const secondPart = parts[1].trim();
        if (secondPart.length > 0) {
          result = firstPart + '. ' + secondPart.charAt(0).toUpperCase() + secondPart.slice(1);
        } else {
          result = firstPart + '.';
        }
      }
    }
    
    // Capitalize first letter
    if (result && result.length > 0) {
      result = result.charAt(0).toUpperCase() + result.slice(1);
    }
    
    // Add period if no ending punctuation
    if (result && !/[.!?]$/.test(result)) {
      result += '.';
    }
    
    return result;
  } catch (_) {
    return text;
  }
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
  overlay.style.display = "block";
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
      overlay.style.display = "block";

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
        // COMMENTED OUT: Feature that cuts out all sentences after the first one
        // addMessage(removeSecondSentence(analysis), true);
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
    overlay.style.display = "block";

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
      // COMMENTED OUT: Feature that cuts out all sentences after the first one
      // addMessage(removeSecondSentence(analysis), true);
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

// Function to block all events when popup is open (but allow popup interactions)
function blockAllEvents(event) {
  if (popup.style.display === "block") {
    // Allow interactions within the popup itself
    if (popup.contains(event.target)) {
      return; // Don't block events within the popup
    }
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    return false;
  }
}

// Add comprehensive event blocking when popup is open
document.addEventListener("click", (event) => {
  // If popup is open, prevent all page interactions
  if (popup.style.display === "block") {
    // Allow interactions within the popup itself
    if (popup.contains(event.target)) {
      return; // Don't block events within the popup
    }
    
    // If click is outside the popup & the button, close the popup
    if (!popup.contains(event.target) && !floatingButton.contains(event.target)) {
      popup.style.display = "none";
      overlay.style.display = "none";
      // Clear conversation history when popup closes - no persistence
      conversationHistory = [];
    }
    // Always prevent the event from affecting the page when popup is open
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    return false;
  }

  // If click is not on the floating button, hide it
  if (!floatingButton.contains(event.target)) {
    floatingButton.style.display = "none";
  }
}, true); // Use capture phase

// Block all mouse events when popup is open
document.addEventListener("mousedown", blockAllEvents, true);
document.addEventListener("mouseup", blockAllEvents, true);
document.addEventListener("mousemove", blockAllEvents, true);
document.addEventListener("mouseover", blockAllEvents, true);
document.addEventListener("mouseout", blockAllEvents, true);
document.addEventListener("contextmenu", blockAllEvents, true);

// Block all touch events when popup is open
document.addEventListener("touchstart", blockAllEvents, true);
document.addEventListener("touchend", blockAllEvents, true);
document.addEventListener("touchmove", blockAllEvents, true);

// Block all keyboard events when popup is open (except our shortcuts and popup interactions)
document.addEventListener("keydown", (event) => {
  if (popup.style.display === "block") {
    // Allow interactions within the popup itself
    if (popup.contains(event.target)) {
      return; // Don't block keyboard events within the popup
    }
    
    // Allow our keyboard shortcuts to work
    const isCtrlZ = event.ctrlKey && event.key === "z";
    const isCmdB = (event.metaKey || event.ctrlKey) && event.key === "b";
    const isProviderSwitch = (event.ctrlKey || event.metaKey) && event.shiftKey && event.key === "p";
    
    if (!isCtrlZ && !isCmdB && !isProviderSwitch) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      return false;
    }
  }
}, true);

// Block keyup and keypress events when popup is open (except within popup)
document.addEventListener("keyup", (event) => {
  if (popup.style.display === "block" && !popup.contains(event.target)) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    return false;
  }
}, true);

document.addEventListener("keypress", (event) => {
  if (popup.style.display === "block" && !popup.contains(event.target)) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    return false;
  }
}, true);

// Keyboard shortcut to switch LLM providers (Ctrl/Cmd + Shift + P)
document.addEventListener('keydown', function(event) {
  // Check for Ctrl+Shift+P or Cmd+Shift+P
  if ((event.ctrlKey || event.metaKey) && event.shiftKey) {
    event.preventDefault();
    event.stopPropagation();

    // Switch to the other provider
    const newProvider = currentLLMProvider === 'local' ? 'gemini' : 'local';
    setLLMProvider(newProvider);

    console.log(`🔄 Keyboard shortcut activated - switching to ${newProvider.toUpperCase()}`);
  }
});
