// Create a host element for the shadow DOM
const shadowHost = document.createElement("div");
shadowHost.id = "my-ai-helper-host";
shadowHost.style.cssText = "position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647; pointer-events: none; overflow: visible;";
document.body.appendChild(shadowHost);
const shadowRoot = shadowHost.attachShadow({ mode: "open" });

const style = document.createElement("style");
style.innerHTML = `
  .my-ai-helper-extension, .my-ai-helper-extension * {
      box-sizing: content-box;
  }

  .popup::-webkit-scrollbar {
      width: 6px;
  }
  .popup::-webkit-scrollbar-track {
      background: transparent;
  }
  .popup::-webkit-scrollbar-thumb {
      background-color: #aaa;
      border-radius: 3px;
      border: none;
  }

  .chat-container::-webkit-scrollbar {
      width: 6px;
  }
  .chat-container::-webkit-scrollbar-track {
      background: transparent;
  }
  .chat-container::-webkit-scrollbar-thumb {
      background-color: #aaa;
      border-radius: 3px;
      border: none;
  }
  .chat-container {
      scrollbar-width: thin;
      scrollbar-color: #aaa transparent;
      font-size: 14px; 
      font-family: ui-sans-serif; 
  }

  .popup {
      font-size: 14px;
      font-family: ui-sans-serif;;
      scrollbar-width: thin;
      scrollbar-color: #aaa transparent;
  }

  .input-container button {
      font-size: 14px; 
      display: flex;
      align-items: center;
  }

  .message, .message.ai, .message.user {
      font-size: 14px;
  }

  .message.thinking {
      font-size: 14px;
  }

  .floating-button {
      position: absolute;
      width: 30px;
      height: 30px;
      background: #4285f4;
      border-radius: 50%;
      cursor: pointer;
      z-index: 10000;
      box-shadow: 0 2px 5px rgba(0,0,0,0.2);
      transition: transform 0.2s;
      justify-content: center;
      align-items: center;
      font-size: 20px;
      color: white;
  }

  .provider-notification {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0, 0, 0, 0.9);
      color: white;
      padding: 16px 24px;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 500;
      z-index: 10002;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      border: 2px solid #4285f4;
  }

  .popup {
      position: fixed;
      padding: 13px;
      background: white;
      font-size: 14px;
      line-height: 1.5;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      width: min(332px, calc(100vw - 40px));
      max-width: calc(100vw - 40px);
      z-index: 10001;
      color: #333;
      overflow-y: auto;
      overflow-x: hidden;
      max-height: min(350px, calc(100vh - 40px));
      text-align: left;
      box-sizing: border-box;
      pointer-events: auto;
      -webkit-font-smoothing: antialiased;
      overscroll-behavior: contain;
  }

  .popup-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: transparent;
      z-index: 10000;
      pointer-events: auto;
  }

  .chat-container {
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
  }

  .quick-prompts {
      display: flex;
      justify-content: center;
      margin-top: 11px;
      gap: 5px;
  }

  .quick-prompt-button {
      font-size: 9px;
      color: rgb(76 75 75);
      cursor: pointer;
      border: none;
      background: none;
      padding: 0;
      font-weight: 400;
  }

  .input-container {
      display: flex;
      gap: 8px;
      color: black;
      text-align: left;
  }

  .followup-input {
      flex: 1;
      padding: 8px;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
      background-color: white;
      font-size: 13px;
      color: black;
      text-align: left;
      height: 15px;
      margin-top: 5px;
  }

  .debug-copy-button {
      position: absolute;
      top: 4px;
      right: 4px;
      width: 14px;
      height: 14px;
      font-size: 8px;
      color: #ccc;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 3px;
  }

  .message {
      margin-top: 10px;
      padding: 9px 12px;
      border-radius: 8px;
      max-width: 89%;
      word-wrap: break-word;
      position: relative;
      margin-right: 5px;
  }

  .message.ai {
      background: #f8f9fa;
      margin-right: auto;
  }

  .message.user {
      background: #e3f2fd;
  }

  .message-play-icon {
      position: absolute;
      bottom: 7px;
      right: 7px;
      cursor: pointer;
      z-index: 1;
      height: 12px;
      width: 12px;
  }

  .ai-code-block {
      background: #1e1e1e;
      border-radius: 6px;
      margin: 6px 0;
      overflow: hidden;
  }

  .ai-code-lang {
      font-size: 10px;
      color: #888;
      padding: 6px 10px 0 10px;
      font-family: ui-sans-serif;
  }

  .ai-code-pre {
      margin: 0;
      padding: 10px;
      overflow-x: auto;
      font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
      font-size: 12px;
      line-height: 1.4;
      color: #e4e4e4;
      white-space: pre;
  }

  .ai-inline-code {
      background: #f0f0f0;
      padding: 1px 5px;
      border-radius: 3px;
      font-family: ui-monospace, Menlo, monospace;
      font-size: 12px;
  }
`;
shadowRoot.appendChild(style);

// Create a floating button element
const floatingButton = document.createElement("div");
floatingButton.className = "floating-button my-ai-helper-extension";
floatingButton.style.display = "none";
floatingButton.innerHTML = "?";
floatingButton.addEventListener("mouseenter", () => {
  floatingButton.style.transform = "scale(1.1)";
});
floatingButton.addEventListener("mouseleave", () => {
  floatingButton.style.transform = "scale(1)";
});

//commented out since i use shortcut to open the popup for now
// shadowRoot.appendChild(floatingButton);


// Create notification element for provider switching
const notificationDiv = document.createElement("div");
notificationDiv.className = "provider-notification my-ai-helper-extension";
notificationDiv.style.display = "none";

// Function to show notification
function showProviderNotification(provider) {
  const providerMeta = {
    openai: { name: 'OpenAI', color: '#10a37f', emoji: 'AI' },
    local: { name: 'Local LLM', color: '#ff6b35', emoji: 'L' },
    gemini: { name: 'Gemini AI', color: '#4285f4', emoji: 'G' },
  };
  const meta = providerMeta[provider] || providerMeta.openai;

  notificationDiv.innerHTML = `${meta.emoji} Switched to ${meta.name}`;
  notificationDiv.style.borderColor = meta.color;
  notificationDiv.style.display = 'block';

  // Hide after 2 seconds
  setTimeout(() => {
    notificationDiv.style.display = 'none';
  }, 2000);
}

// Function to show movie mode notification
function showMovieModeNotification(enabled) {
  const emoji = enabled ? '🎬' : '📖';
  const message = enabled ? 'Movie Mode ON' : 'Movie Mode OFF';
  const color = enabled ? '#9c27b0' : '#757575';

  notificationDiv.innerHTML = `${emoji} ${message}`;
  notificationDiv.style.borderColor = color;
  notificationDiv.style.display = 'block';

  // Hide after 2 seconds
  setTimeout(() => {
    notificationDiv.style.display = 'none';
  }, 2000);
}

// Initialize notification
shadowRoot.appendChild(notificationDiv);

// Make setLLMProvider function available globally
window.setLLMProvider = function(provider) {
  if (provider === 'openai' || provider === 'local' || provider === 'gemini') {
    currentLLMProvider = provider;
    console.log(`✅ Switched to ${provider.toUpperCase()} LLM provider`);
    console.log(`💡 Switch providers: Ctrl/Cmd+1 or use setLLMProvider('openai'/'local'/'gemini')`);

    // Show notification
    showProviderNotification(provider);
  } else {
    console.error(`❌ Invalid provider: ${provider}. Use 'openai', 'local', or 'gemini'`);
  }
};

// Create a popup element
const popup = document.createElement("div");
popup.className = "popup my-ai-helper-extension";
popup.style.display = "none";

// Create an overlay to block clicks outside popup
const overlay = document.createElement("div");
overlay.className = "popup-overlay my-ai-helper-extension";
overlay.style.display = "none";
shadowRoot.appendChild(overlay);

// Add wheel event handler to popup for scroll wheel support
popup.addEventListener("wheel", (e) => {
  e.stopPropagation();
  // Let the default scroll behavior happen
}, { passive: true });

// Add click handler to overlay to close popup when clicking outside
overlay.addEventListener("click", () => {
  popup.style.display = "none";
  overlay.style.display = "none";
  conversationHistory = [];
});

let clickOutsideHandler = null;

function enableClickOutsideClose() {
  clickOutsideHandler = (event) => {
    // Only handle clicks outside the popup
    // Check if the click was inside the popup using composedPath for Shadow DOM support
    const path = event.composedPath();
    if (!path.includes(popup) && popup.style.display === "block") {
      // Don't preventDefault - this interferes with text selection on the page
      // Just close the popup and let the click proceed normally
      popup.style.display = "none";
      overlay.style.display = "none";
      conversationHistory = [];
      // Remove the handler when popup is closed
      document.removeEventListener("click", clickOutsideHandler, true);
      clickOutsideHandler = null;
    }
  };
  // Use capture phase to intercept clicks before they reach page elements
  document.addEventListener("click", clickOutsideHandler, true);
}

// Create chat container
const chatContainer = document.createElement("div");
chatContainer.className = "chat-container";
popup.appendChild(chatContainer);

const quickPromptsContainer = document.createElement("div");
quickPromptsContainer.className = "quick-prompts";
const quickPromptButtons = new Map();

const createQuickPromptButton = (textContent) => {
  const button = document.createElement("button");
  button.textContent = textContent;
  button.className = "quick-prompt-button";
  return button;
};

QUICK_PROMPTS.forEach((prompt) => {
  const button = createQuickPromptButton(prompt.label);
  quickPromptButtons.set(prompt.label, button);
  quickPromptsContainer.appendChild(button);
});
popup.appendChild(quickPromptsContainer);

// Create input container
const inputContainer = document.createElement("div");
inputContainer.className = "input-container";

const input = document.createElement("input");
input.className = "followup-input";
input.placeholder = "Ask a follow-up question...";

// Stop keyboard events from propagating to the page (prevents YouTube shortcuts etc.)
input.addEventListener("keydown", (e) => {
  e.stopPropagation();
});
input.addEventListener("keyup", (e) => {
  e.stopPropagation();
});
input.addEventListener("keypress", (e) => {
  e.stopPropagation();
});

inputContainer.appendChild(input);
popup.appendChild(inputContainer);

// Debug copy button - copies full conversation history to clipboard
const debugBtn = document.createElement("div");
debugBtn.className = "debug-copy-button";
debugBtn.textContent = "d";
debugBtn.title = "Copy conversation history to clipboard";
debugBtn.addEventListener("click", () => {
  const dump = conversationHistory.map(m => m.role + ': ' + m.content).join('\n\n');
  navigator.clipboard.writeText(dump || 'no history');
  debugBtn.textContent = "ok";
  setTimeout(() => debugBtn.textContent = "d", 800);
});
popup.appendChild(debugBtn);

shadowRoot.appendChild(popup);

/////////////////////////////////////////////////////////////
// == Helper to add a message to the chat window ==
/////////////////////////////////////////////////////////////

function formatAIResponse(text) {
  // Remove leading '-' or ':' from the response
  return text.replace(/^[-:]\s*/g, '').trim();
}

function addMessage(text, isAI = false) {
  const messageDiv = document.createElement("div");
  messageDiv.className = `message ${isAI ? "ai" : "user"}`;
  // Format AI responses first
  text = isAI ? formatAIResponse(text) : text;
  // Extract code blocks first (before HTML escaping) so their contents are escaped separately
  const codeBlocks = [];
  let working = text.replace(/```(\w+)?\n?([\s\S]*?)```/g, (_, lang, code) => {
    const escaped = code.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const langLabel = lang ? `<div class="ai-code-lang">${lang}</div>` : '';
    const block = `<div class="ai-code-block">${langLabel}<pre class="ai-code-pre">${escaped}</pre></div>`;
    codeBlocks.push(block);
    return `\x00CODE${codeBlocks.length - 1}\x00`;
  });

  // Escape remaining HTML, handle inline code, then line breaks
  working = working
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/`([^`\n]+)`/g, '<code class="ai-inline-code">$1</code>')
    .replace(/\n{2,}/g, "\n")
    .replace(/\n/g, "<br>");

  // Restore code blocks
  const formattedText = working.replace(/\x00CODE(\d+)\x00/g, (_, i) => codeBlocks[parseInt(i)]);

  messageDiv.innerHTML = formattedText;

  // Add play icon to user messages in bottom right corner
  if (!isAI) {
    const playIcon = document.createElement("div");
    playIcon.className = "message-play-icon";
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

  // Always scroll popup to bottom to see latest content
  setTimeout(() => {
    popup.scrollTop = popup.scrollHeight;
  }, 50);

  return messageDiv;
}
