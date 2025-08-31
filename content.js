/////////////////////////////////////////////////////////////
// == Global conversation history array ==
/////////////////////////////////////////////////////////////
let conversationHistory = [];

// Helper to get all text on the page with selected text marked
function getAllPageText() {
  // Get the trimmed inner text of the entire document body
  let pageText = document.body.innerText.trim();

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
      const windowSize = 1000;

      // Calculate the start and end indices for slicing, ensuring they stay within bounds
      const start = Math.max(startMarkerIndex - windowSize, 0);
      const end = Math.min(
        finishMarkerIndex + windowSize,
        pageTextWords.length
      );

      // Extract the final text window around the selection
      const finalText = pageTextWords.slice(start, end).join(" ");

      // Return the final text containing the selection and surrounding context
      return finalText;
    }
  }

  // If there is no selection, return the entire page text
  return pageText;
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
      background: #f1f1f1 !important;
  }
  .chat-container::-webkit-scrollbar-thumb {
      background-color: #aaa !important;
      border-radius: 3px !important;
      border: 1px solid #f1f1f1 !important;
  }
  .chat-container {
      scrollbar-width: thin !important;
      scrollbar-color: #aaa #f1f1f1 !important;
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
      font-size: 12px !important;
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
document.body.appendChild(floatingButton);

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

// Create input container
const inputContainer = document.createElement("div");
inputContainer.className = "input-container";
inputContainer.style.cssText = `
  display: flex !important; 
  gap: 8px !important;
  border-top: 1px solid #e0e0e0 !important;
  padding-top: 10px !important;
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
    margin-bottom: 10px !important;
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
    // Replace bold syntax (**text** or __text__) with <strong>
    .replace(/\*\*(.*?)\*\*|__(.*?)__/gs, "<strong>$1$2</strong>")
    // Replace italic syntax (*text* or _text_) with <em>
    .replace(/\*(.*?)\*|_(.*?)_/gs, "<em>$1$2</em>")
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
let originalText = "";

// == Gemini API details ==
async function analyzeWithGemini(text, isFollowUp = false) {
  const API_ENDPOINT =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
  const API_KEY = "AIzaSyC9jnmAh_cyvg0hNa5bejNtKGRhkDC4noE"; // DONT DELETE

  if (!text.trim()) {
    throw new Error("Empty text provided");
  }

  ///////////////////////////////////////////
  // == Build or update the conversation ==
  ///////////////////////////////////////////
  if (isFollowUp) {
    // User follow-up
    conversationHistory.push({
      role: "user",
      content: text,
    });
  } else {
    // First time
    conversationHistory.push({
      role: "system",
      content: text,
    });
  }

  // Convert conversation into a single string
  const conversationText = conversationHistory
    .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
    .join("\n\n");

  let prompt;
  if (!isFollowUp) {
    prompt = `You have an excerpt from a webpage. The selected word or phrase is marked in the text between the tags <<<SELECTED>>> and <<</SELECTED>>>.

${conversationText}

1. Identify the selected text inside the tags.
2. Define or explain it:
 - If it is a single word, collocation, or idiom, provide its most common meaning. If it’s a verb, use its infinitive form.
 - If it’s longer than three words, paraphrase it simply for easy understanding, without repeating the original phrase.
 - Do not include or mention the <<<SELECTED>>> or <<</SELECTED>>> tags in your reply.

3. Analyze its meaning and usage in the context.
 - If it includes slang, metaphors, jokes, or cultural references, explain them clearly.
 - Keep explanations short, clear, and easy to understand.
 - Do NOT mention the selection markers or explain their presence to the user.

Examples:
Context:
Where do polar bears keep their money? In a <<<SELECTED>>>snowbank<<</SELECTED>>>.

Output:
**Definition:** Snowbank means a pile of snow.

**Context analysis:** This is a wordplay joke. It refers to both a pile of snow and a bank where you keep money.

Context:
<<<SELECTED>>>Renat Davletgildeyev accused Zhirinovsky of sexual harassment<<</SELECTED>>>

Output:
**Explanation:** Renat Davletgildeyev officially claimed Zhirinovsky engaged in unwanted sexual behavior.

**Context analysis:** This refers to a serious accusation against a well-known political figure.

IMPORTANT:
Never show or mention the <<<SELECTED>>> markers in the reply.
  `;
  } else {
    const lastAssistantMessage = [...conversationHistory]
      .reverse()
      .find((m) => m.role === "assistant")?.content || "";
    const originalSelection = originalText || "";

    prompt = `Answer the user's latest question directly. Use the prior reply only if helpful. Do not re-analyze the original selection unless asked.

Original selection: "${originalSelection}"

Prior reply: "${lastAssistantMessage}"

User question: "${text}"

Rules:
- Be clear and helpful.
- Avoid repeating context analysis.
- Max 150 characters.
- If info is missing, use your general knowledge without mentioning missing context.`;
  }

  try {
    const requestBody = {
      contents: [
        {
          parts: [
            {
              text: prompt,
            },
          ],
        },
      ],
      safetySettings: [
        {
          category: "HARM_CATEGORY_HATE_SPEECH",
          threshold: "BLOCK_NONE",
        },
        {
          category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
          threshold: "BLOCK_NONE",
        },
        {
          category: "HARM_CATEGORY_DANGEROUS_CONTENT",
          threshold: "BLOCK_NONE",
        },
        {
          category: "HARM_CATEGORY_HARASSMENT",
          threshold: "BLOCK_NONE",
        },
        {
          category: "HARM_CATEGORY_CIVIC_INTEGRITY",
          threshold: "BLOCK_NONE",
        },
      ],
    };

    const response = await fetch(`${API_ENDPOINT}?key=${API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    console.log("Received response status:", response.status);

    if (!response.ok) {
      const errorData = await response.text();
      console.error("API Error Response:", errorData);
      throw new Error(
        `API request failed with status ${response.status}: ${errorData}`
      );
    }

    const data = await response.json();
    console.log("API Response data:", data);

    if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
      console.error("Invalid API response format:", data);
      throw new Error("Invalid response format from API");
    }

    // Capture the AI's reply in conversation history
    const aiReply = data.candidates[0].content.parts[0].text;
    conversationHistory.push({
      role: "assistant",
      content: aiReply,
    });

    return aiReply;
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error; // Re-throw to handle in the calling function
  }
}

/////////////////////////////////////////////////////////////
// == Capture user's text selection, now with full page text
/////////////////////////////////////////////////////////////
document.addEventListener("selectionchange", () => {
  const selection = window.getSelection();
  const selectedText = selection.toString().trim();

  if (selectedText) {
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    // We'll ignore the old "extended context" function and just use the full page text:
    const fullPageContext = getAllPageText();

    // Build the final text that includes entire page data + selected text
    lastSelectedText = `
      Here is some context for you including selected text:
      "${fullPageContext}"

      Selected portion is: "${selectedText}"
    `;
    originalText = selectedText;

    positionButton(rect);

    // Delay showing the button in case the user is still dragging
    setTimeout(() => {
      if (!isLeftMouseDown) floatingButton.style.display = "flex";
    }, 1000);
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
      // Clear chat visually AND conversation history
      chatContainer.innerHTML = "";
      conversationHistory = [];

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

      // Show "Analyzing..." bubble
      addMessage("Analyzing...", true);
      positionPopup();
      floatingButton.style.display = "none";

      try {
        console.log("Sending API request for text:", lastSelectedText);
        const analysis = await analyzeWithGemini(lastSelectedText);
        console.log("Received analysis:", analysis);

        // === FIX ===
        // If the popup was closed while waiting for the API, do nothing.
        if (popup.style.display === "none") {
          conversationHistory = []; // Ensure history is clean in case of race condition
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
    // Clear chat visually AND conversation history
    chatContainer.innerHTML = "";
    conversationHistory = [];

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

    // Show "Analyzing..." bubble
    addMessage("Analyzing...", true);
    positionPopup();
    floatingButton.style.display = "none";

    try {
      console.log("Sending API request for text:", lastSelectedText);
      const analysis = await analyzeWithGemini(lastSelectedText);
      console.log("Received analysis:", analysis);

      // === FIX ===
      // If the popup was closed while waiting for the API, do nothing.
      if (popup.style.display === "none") {
        conversationHistory = []; // Ensure history is clean in case of race condition
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
    const response = await analyzeWithGemini(userQuestion, true);

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
    // Clear the conversation history upon close
    conversationHistory = [];
  }

  // If click is not on the floating button, hide it
  if (!floatingButton.contains(event.target)) {
    floatingButton.style.display = "none";
  }
});
