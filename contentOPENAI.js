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
  .chat-container::-webkit-scrollbar {
      width: 6px;
  }
  .chat-container::-webkit-scrollbar-track {
      background: #f1f1f1;
  }
  .chat-container::-webkit-scrollbar-thumb {
      background-color: #aaa;
      border-radius: 3px;
      border: 1px solid #f1f1f1;
  }
  .chat-container {
      scrollbar-width: thin;
      scrollbar-color: #aaa #f1f1f1;
      font-size: 12px; /* Fixed font size for the chat messages */
      font-family: Arial, sans-serif; /* Set a consistent font family */
  }

  /* Ensure the popup has a consistent font size */
  .popup {
      font-size: 12px; /* Fixed font size for the popup */
      font-family: Arial, sans-serif; /* Consistent font family for the popup */
  }

  /* Set font size for input and send button */
  .input-container input,
  .input-container button {
      font-size: 12px; /* Fixed font size for the input field */
  }

  /* Optional: You can adjust this if you need a different font size for AI and user messages */
  .message {
      font-size: 12px; /* Consistent font size for chat messages */
  }

  .message.ai {
      font-size: 12px;
  }

  .message.user {
      font-size: 12px;
  }
`;
document.head.appendChild(style);

// Create a floating button element
const floatingButton = document.createElement("div");
floatingButton.className = "floating-button";
floatingButton.style.cssText = `
  position: absolute;
  width: 40px; /* Increased size for better visibility */
  height: 40px;
  background: #4285f4;
  border-radius: 50%;
  cursor: pointer;
  display: none;
  z-index: 10000;
  box-shadow: 0 2px 5px rgba(0,0,0,0.2);
  transition: transform 0.2s;
  justify-content: center; /* Center the icon */
  align-items: center;
  font-size: 20px;
  color: white;
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
popup.className = "popup";
popup.style.cssText = `
  position: absolute;
  padding: 20px;
  background: white;
  font-size: 12px;
  line-height: 1.5;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  max-width: 270px;
  z-index: 999; /* Ensure it's above the floating button */
  display: none;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
  color: #333;
  overflow: auto;
  max-height: 80vh;
  text-align: left;
`;

// Create chat container
const chatContainer = document.createElement("div");
chatContainer.className = "chat-container";
chatContainer.style.cssText = `
  overflow-y: auto;
  margin-bottom: 10px;
  max-height: 250px;
  line-height: 1.5;
`;
popup.appendChild(chatContainer);

// Create input container
const inputContainer = document.createElement("div");
inputContainer.className = "input-container";
inputContainer.style.cssText = `
  display: flex;
  gap: 8px;
  border-top: 1px solid #e0e0e0;
  padding-top: 10px;
  color: black;
  text-align: left;

`;

const input = document.createElement("input");
input.placeholder = "Ask a follow-up question...";
input.style.cssText = `
  flex: 1;
  padding: 8px;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  background-color: white;
  font-size: 12px;
  color: black;
  text-align: left;
`;

const sendButton = document.createElement("button");
sendButton.textContent = "Send";
sendButton.style.cssText = `
  padding: 8px 16px;
  background: #4285f4;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
`;

inputContainer.appendChild(input);
inputContainer.appendChild(sendButton);
popup.appendChild(inputContainer);
document.body.appendChild(popup);

/////////////////////////////////////////////////////////////
// == Helper to add a message to the chat window ==
/////////////////////////////////////////////////////////////
function addMessage(text, isAI = false) {
  const messageDiv = document.createElement("div");
  messageDiv.className = `message ${isAI ? "ai" : "user"}`;
  messageDiv.style.cssText = `
    margin-bottom: 10px;
    padding: 8px 12px;
    border-radius: 8px;
    max-width: 85%;
    word-wrap: break-word;

    ${
      isAI
        ? `
      background: #f8f9fa;
      margin-right: auto;
    `
        : `
      background: #e3f2fd;
      margin-left: auto;
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

// == OpenAI API details ==
async function analyzeWithGPT(text, isFollowUp = false) {
  const API_ENDPOINT = "https://api.openai.com/v1/chat/completions";
  const API_KEY =
    "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";
  const MODEL = "gpt-4o";

  if (!text.trim()) {
    throw new Error("Empty text provided");
  }

  ///////////////////////////////////////////
  // == Build or update the conversation ==
  ///////////////////////////////////////////
  let messages = [];
  if (!isFollowUp) {
    messages.push({ role: "user", content: text });
  } else {
    // Add previous conversation history
    messages = [
      ...conversationHistory.map((item) => ({
        role: item.role,
        content: item.content,
      })),
      { role: "user", content: text },
    ];
    messages.unshift({
      role: "system",
      content: `Here is our conversation so far. Please reply to my last message.

**Ensure your response:**
- Doesn't overuse markdown.
- Avoids repetitive information.
- Is clear and well-structured.
- Is 150 characters max.
IMPORTANT: If something is not mentioned in the context - but user asks you about that - you use your own knowledge (data you've been trained on), make assumptions and so on. You also DO NOT mention that context doesn't include that info.`,
    });
  }

  try {
    const response = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: messages,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("OpenAI API Error:", errorData);
      throw new Error(
        `OpenAI API request failed with status ${response.status}: ${
          errorData.error?.message || JSON.stringify(errorData)
        }`
      );
    }

    const data = await response.json();
    console.log("OpenAI Response:", data);

    if (
      !data.choices ||
      data.choices.length === 0 ||
      !data.choices[0].message ||
      !data.choices[0].message.content
    ) {
      console.error("Invalid OpenAI response format:", data);
      throw new Error("Invalid response format from OpenAI API");
    }

    const aiReply = data.choices[0].message.content;

    // Capture the AI's reply in conversation history
    conversationHistory.push({
      role: "assistant",
      content: aiReply,
    });

    return aiReply;
  } catch (error) {
    console.error("OpenAI API Error:", error);
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

document.addEventListener("keydown", async (e) => {
  // Check if Ctrl + Z is pressed
  if (e.ctrlKey && e.key === "z") {
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
        const analysis = await analyzeWithGPT(lastSelectedText);
        console.log("Received analysis:", analysis);

        // Clear "Analyzing..." and show conversation
        chatContainer.innerHTML = "";

        addMessage(originalText, false);
        addMessage(analysis, true);

        positionPopup();
      } catch (error) {
        chatContainer.innerHTML = "";
        addMessage("Error: Could not analyze text. Please try again.", true);
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
      const analysis = await analyzeWithGPT(lastSelectedText);
      console.log("Received analysis:", analysis);

      // Clear "Analyzing..." and show conversation
      chatContainer.innerHTML = "";

      addMessage(originalText, false);
      addMessage(analysis, true);

      positionPopup();
    } catch (error) {
      chatContainer.innerHTML = "";
      addMessage("Error: Could not analyze text. Please try again.", true);
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

  try {
    const response = await analyzeWithGPT(userQuestion, true);

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

sendButton.addEventListener("click", handleUserInput);
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
