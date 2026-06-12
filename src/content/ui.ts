import type { LLMProvider, QuickPrompt } from "../shared/types";

export interface ExtensionUIOptions {
  quickPrompts: readonly QuickPrompt[];
  getConversationDump(): string;
  onClose(): void;
  onPlayTTS(text: string): void;
}

export interface ExtensionUI {
  shadowRoot: ShadowRoot;
  floatingButton: HTMLDivElement;
  notificationDiv: HTMLDivElement;
  popup: HTMLDivElement;
  overlay: HTMLDivElement;
  chatContainer: HTMLDivElement;
  quickPromptButtons: Map<string, HTMLButtonElement>;
  input: HTMLInputElement;
  addMessage(text: string, isAI?: boolean): HTMLDivElement;
  clearMessages(): void;
  closePopup(): void;
  enableClickOutsideClose(): void;
  setPopupPosition(position: { left: number; top: number }): void;
  showMovieModeNotification(enabled: boolean): void;
  showProviderNotification(provider: LLMProvider): void;
}

const SVG_NS = "http://www.w3.org/2000/svg";

const STYLE_TEXT = `
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

function formatAIResponse(text: string): string {
  return text.replace(/^[-:]\s*/g, "").trim();
}

function appendTextWithLineBreaks(parent: HTMLElement, text: string): void {
  const lines = text.replace(/\n{2,}/g, "\n").split("\n");
  lines.forEach((line, index) => {
    if (index > 0) {
      parent.appendChild(document.createElement("br"));
    }
    parent.appendChild(document.createTextNode(line));
  });
}

function appendInlineFormattedText(parent: HTMLElement, text: string): void {
  const inlineCodePattern = /`([^`\n]+)`/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = inlineCodePattern.exec(text))) {
    appendTextWithLineBreaks(parent, text.slice(lastIndex, match.index));
    const code = document.createElement("code");
    code.className = "ai-inline-code";
    code.textContent = match[1] ?? "";
    parent.appendChild(code);
    lastIndex = match.index + match[0].length;
  }

  appendTextWithLineBreaks(parent, text.slice(lastIndex));
}

function appendCodeBlock(parent: HTMLElement, lang: string | undefined, codeText: string): void {
  const block = document.createElement("div");
  block.className = "ai-code-block";

  if (lang) {
    const label = document.createElement("div");
    label.className = "ai-code-lang";
    label.textContent = lang;
    block.appendChild(label);
  }

  const pre = document.createElement("pre");
  pre.className = "ai-code-pre";
  pre.textContent = codeText;
  block.appendChild(pre);
  parent.appendChild(block);
}

function appendFormattedMessage(parent: HTMLElement, text: string): void {
  const codeBlockPattern = /```(\w+)?\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockPattern.exec(text))) {
    appendInlineFormattedText(parent, text.slice(lastIndex, match.index));
    appendCodeBlock(parent, match[1], match[2] ?? "");
    lastIndex = match.index + match[0].length;
  }

  appendInlineFormattedText(parent, text.slice(lastIndex));
}

function createPlayIcon(): HTMLDivElement {
  const playIcon = document.createElement("div");
  playIcon.className = "message-play-icon";

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", "12");
  svg.setAttribute("height", "12");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");

  const circle = document.createElementNS(SVG_NS, "circle");
  circle.setAttribute("cx", "12");
  circle.setAttribute("cy", "12");
  circle.setAttribute("r", "12");
  circle.setAttribute("fill", "#4285f4");
  svg.appendChild(circle);

  const polygon = document.createElementNS(SVG_NS, "polygon");
  polygon.setAttribute("points", "10,8 16,12 10,16");
  polygon.setAttribute("fill", "white");
  svg.appendChild(polygon);

  playIcon.appendChild(svg);
  return playIcon;
}

function createQuickPromptButton(textContent: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.textContent = textContent;
  button.className = "quick-prompt-button";
  return button;
}

function isTopFrame(): boolean {
  try {
    return window.top === window.self;
  } catch {
    return false;
  }
}

export function createExtensionUI(options: ExtensionUIOptions): ExtensionUI | null {
  if (!document.body) {
    return null;
  }

  const existingHost = document.querySelector("#my-ai-helper-host");
  if (existingHost) {
    return null;
  }

  const shadowHost = document.createElement("div");
  shadowHost.id = "my-ai-helper-host";
  shadowHost.style.cssText =
    "position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647; pointer-events: none; overflow: visible;";
  document.body.appendChild(shadowHost);
  const shadowRoot = shadowHost.attachShadow({ mode: "open" });
  if (isTopFrame()) {
    console.log("✅ AI Helper TS build loaded");
  }

  const style = document.createElement("style");
  style.textContent = STYLE_TEXT;
  shadowRoot.appendChild(style);

  const floatingButton = document.createElement("div");
  floatingButton.className = "floating-button my-ai-helper-extension";
  floatingButton.style.display = "none";
  floatingButton.textContent = "?";
  floatingButton.addEventListener("mouseenter", () => {
    floatingButton.style.transform = "scale(1.1)";
  });
  floatingButton.addEventListener("mouseleave", () => {
    floatingButton.style.transform = "scale(1)";
  });

  const notificationDiv = document.createElement("div");
  notificationDiv.className = "provider-notification my-ai-helper-extension";
  notificationDiv.style.display = "none";
  shadowRoot.appendChild(notificationDiv);

  const popup = document.createElement("div");
  popup.className = "popup my-ai-helper-extension";
  popup.style.display = "none";

  const overlay = document.createElement("div");
  overlay.className = "popup-overlay my-ai-helper-extension";
  overlay.style.display = "none";
  shadowRoot.appendChild(overlay);

  const closePopup = (): void => {
    popup.style.display = "none";
    overlay.style.display = "none";
    options.onClose();
  };

  popup.addEventListener(
    "wheel",
    (event) => {
      event.stopPropagation();
    },
    { passive: true }
  );

  overlay.addEventListener("click", closePopup);

  let clickOutsideHandler: ((event: MouseEvent) => void) | null = null;

  const enableClickOutsideClose = (): void => {
    if (clickOutsideHandler) {
      document.removeEventListener("click", clickOutsideHandler, true);
    }

    clickOutsideHandler = (event: MouseEvent) => {
      const path = event.composedPath();
      if (!path.includes(popup) && popup.style.display === "block") {
        closePopup();
        if (clickOutsideHandler) {
          document.removeEventListener("click", clickOutsideHandler, true);
          clickOutsideHandler = null;
        }
      }
    };

    document.addEventListener("click", clickOutsideHandler, true);
  };

  const chatContainer = document.createElement("div");
  chatContainer.className = "chat-container";
  popup.appendChild(chatContainer);

  const quickPromptsContainer = document.createElement("div");
  quickPromptsContainer.className = "quick-prompts";
  const quickPromptButtons = new Map<string, HTMLButtonElement>();

  options.quickPrompts.forEach((prompt) => {
    const button = createQuickPromptButton(prompt.label);
    quickPromptButtons.set(prompt.label, button);
    quickPromptsContainer.appendChild(button);
  });
  popup.appendChild(quickPromptsContainer);

  const inputContainer = document.createElement("div");
  inputContainer.className = "input-container";

  const input = document.createElement("input");
  input.className = "followup-input";
  input.placeholder = "Ask a follow-up question...";

  input.addEventListener("keydown", (event) => {
    event.stopPropagation();
  });
  input.addEventListener("keyup", (event) => {
    event.stopPropagation();
  });
  input.addEventListener("keypress", (event) => {
    event.stopPropagation();
  });

  inputContainer.appendChild(input);
  popup.appendChild(inputContainer);

  const debugBtn = document.createElement("div");
  debugBtn.className = "debug-copy-button";
  debugBtn.textContent = "d";
  debugBtn.title = "Copy conversation history to clipboard";
  debugBtn.addEventListener("click", () => {
    const dump = options.getConversationDump();
    void navigator.clipboard.writeText(dump || "no history");
    debugBtn.textContent = "ok";
    window.setTimeout(() => {
      debugBtn.textContent = "d";
    }, 800);
  });
  popup.appendChild(debugBtn);

  shadowRoot.appendChild(popup);

  const addMessage = (rawText: string, isAI = false): HTMLDivElement => {
    const messageDiv = document.createElement("div");
    messageDiv.className = `message ${isAI ? "ai" : "user"}`;
    const text = isAI ? formatAIResponse(rawText) : rawText;
    appendFormattedMessage(messageDiv, text);

    if (!isAI) {
      const playIcon = createPlayIcon();
      playIcon.addEventListener("click", (event) => {
        event.stopPropagation();
        options.onPlayTTS(text);
      });
      messageDiv.appendChild(playIcon);
    }

    chatContainer.appendChild(messageDiv);

    window.setTimeout(() => {
      popup.scrollTop = popup.scrollHeight;
    }, 50);

    return messageDiv;
  };

  const showProviderNotification = (provider: LLMProvider): void => {
    const providerMeta: Record<LLMProvider, { name: string; color: string; emoji: string }> = {
      openai: { name: "OpenAI", color: "#10a37f", emoji: "AI" },
      local: { name: "Local LLM", color: "#ff6b35", emoji: "L" },
      gemini: { name: "Gemini AI", color: "#4285f4", emoji: "G" },
    };
    const meta = providerMeta[provider];

    notificationDiv.textContent = `${meta.emoji} Switched to ${meta.name}`;
    notificationDiv.style.borderColor = meta.color;
    notificationDiv.style.display = "block";

    window.setTimeout(() => {
      notificationDiv.style.display = "none";
    }, 2000);
  };

  const showMovieModeNotification = (enabled: boolean): void => {
    const emoji = enabled ? "🎬" : "📖";
    const message = enabled ? "Movie Mode ON" : "Movie Mode OFF";
    const color = enabled ? "#9c27b0" : "#757575";

    notificationDiv.textContent = `${emoji} ${message}`;
    notificationDiv.style.borderColor = color;
    notificationDiv.style.display = "block";

    window.setTimeout(() => {
      notificationDiv.style.display = "none";
    }, 2000);
  };

  return {
    shadowRoot,
    floatingButton,
    notificationDiv,
    popup,
    overlay,
    chatContainer,
    quickPromptButtons,
    input,
    addMessage,
    clearMessages() {
      chatContainer.textContent = "";
    },
    closePopup,
    enableClickOutsideClose,
    setPopupPosition(position) {
      popup.style.left = `${position.left}px`;
      popup.style.top = `${position.top}px`;
    },
    showMovieModeNotification,
    showProviderNotification,
  };
}
