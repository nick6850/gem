import type { LLMProvider, QuickPrompt } from "../shared/types";
import {
  formatShortcutParts,
  shortcutFromKeyboardEvent,
  shortcutsEqual,
  type ShortcutBinding,
} from "./shortcutSettings";

export interface ExtensionUIOptions {
  quickPrompts: readonly QuickPrompt[];
  getConversationDump(): string;
  initialAnalyzeShortcuts: readonly ShortcutBinding[];
  onAnalyzeShortcutsChange(shortcuts: readonly ShortcutBinding[]): void;
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
  settingsView: HTMLDivElement;
  addMessage(text: string, isAI?: boolean): HTMLDivElement;
  clearMessages(): void;
  closePopup(): void;
  enableClickOutsideClose(): void;
  setPopupPosition(position: { left: number; top: number }): void;
  setAnalyzeShortcuts(shortcuts: readonly ShortcutBinding[]): void;
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
      --gem-text: #333;
      --gem-secondary-text: rgb(76 75 75);
      --gem-border: #e0e0e0;
      --gem-surface: #f8f9fa;
      --gem-accent-surface: #e3f2fd;
      --gem-radius: 8px;
      --gem-control-radius: 4px;
      font-size: 14px;
      font-family: ui-sans-serif;
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
      border: 1px solid var(--gem-border);
      border-radius: var(--gem-radius);
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      width: min(332px, calc(100vw - 40px));
      max-width: calc(100vw - 40px);
      z-index: 10001;
      color: var(--gem-text);
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
      color: var(--gem-secondary-text);
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
      border: 1px solid var(--gem-border);
      border-radius: var(--gem-control-radius);
      background-color: white;
      font-size: 13px;
      color: black;
      text-align: left;
      height: 15px;
      margin-top: 5px;
  }

  .popup-actions {
      position: absolute;
      top: 4px;
      right: 4px;
      display: flex;
      gap: 3px;
      z-index: 2;
  }

  .popup-action-button {
      width: 14px;
      height: 14px;
      padding: 0;
      color: #8f8f8f;
      opacity: .55;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 3px;
      border: 0;
      background: transparent;
  }

  .popup-action-button:hover,
  .popup-action-button:focus-visible {
      opacity: .9;
      background: #f1f1f1;
      outline: none;
  }

  .popup-action-button svg {
      width: 12px;
      height: 12px;
      display: block;
  }

  .settings-view {
      height: auto;
      color: var(--gem-text);
  }

  .settings-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 9px;
      margin-bottom: 12px;
      border-radius: var(--gem-radius);
      background: var(--gem-accent-surface);
  }

  .settings-back-button,
  .shortcut-delete-button,
  .shortcut-add-button,
  .shortcut-record-button,
  .settings-save-button {
      font: inherit;
      cursor: pointer;
  }

  .settings-back-button {
      width: 24px;
      height: 24px;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 0;
      border-radius: var(--gem-control-radius);
      color: var(--gem-secondary-text);
      background: transparent;
  }

  .settings-back-button:hover {
      background: var(--gem-surface);
  }

  .settings-title {
      margin: 0;
      font-size: 14px;
      line-height: 17px;
      font-weight: 500;
  }

  .settings-subtitle {
      margin: 1px 0 0;
      color: var(--gem-secondary-text);
      font-size: 10px;
      line-height: 13px;
  }

  .settings-card {
      padding: 11px;
      border: 1px solid var(--gem-border);
      border-radius: var(--gem-radius);
      background: var(--gem-surface);
  }

  .settings-section-title {
      margin: 0 0 3px;
      font-size: 12px;
      font-weight: 500;
  }

  .settings-section-description {
      margin: 1px 0 0;
      font-size: 10px;
      color: var(--gem-secondary-text);
  }

  .shortcut-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-top: 10px;
  }

  .shortcut-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
  }

  .shortcut-record-button {
      min-width: 0;
      height: 25px;
      padding: 0;
      border: 0;
      color: var(--gem-text);
      background: transparent;
      display: flex;
      align-items: center;
      gap: 4px;
  }

  .shortcut-keycap {
      min-width: 24px;
      height: 23px;
      padding: 0 5px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--gem-border);
      border-radius: var(--gem-control-radius);
      color: var(--gem-text);
      background: white;
      font-family: ui-monospace, 'SF Mono', Menlo, monospace;
      font-size: 10px;
      font-weight: 400;
      line-height: 23px;
  }

  .shortcut-record-button.is-recording {
      min-width: 112px;
      padding: 0 8px;
      border: 1px dashed #5081F0;
      border-radius: var(--gem-control-radius);
      box-shadow: 0 0 0 2px rgba(80, 129, 240, .12);
      color: #5081F0;
      background: white;
      font-family: ui-sans-serif;
      font-size: 10px;
  }

  .shortcut-delete-button {
      width: 24px;
      height: 24px;
      padding: 0;
      border: 0;
      border-radius: var(--gem-control-radius);
      color: var(--gem-secondary-text);
      background: transparent;
  }

  .shortcut-delete-button svg {
      width: 13px;
      height: 13px;
  }

  .shortcut-delete-button:hover {
      color: #d14343;
      background: #fff0f0;
  }

  .shortcut-add-button {
      width: auto;
      height: 27px;
      margin-top: 8px;
      padding: 0 10px;
      border: 1px dashed var(--gem-border);
      border-radius: var(--gem-control-radius);
      color: #5081F0;
      background: transparent;
      font-size: 10px;
      line-height: 25px;
  }

  .shortcut-add-button:hover {
      color: #5081F0;
      border-color: #5081F0;
      background: var(--gem-accent-surface);
  }

  .settings-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-top: 11px;
  }

  .shortcut-help {
      min-height: 15px;
      margin: 0;
      font-size: 10px;
      color: var(--gem-secondary-text);
  }

  .shortcut-help.error {
      color: #c63e3e;
  }

  .settings-save-button {
      min-width: 56px;
      height: 27px;
      padding: 0 12px;
      flex: none;
      border: 0;
      border-radius: var(--gem-control-radius);
      color: white;
      background: #5081F0;
      font-size: 10px;
      font-weight: 500;
      line-height: 27px;
  }

  .settings-save-button:hover,
  .settings-save-button:focus-visible {
      background: #416fd5;
      outline: none;
  }

  .message {
      margin-top: 10px;
      padding: 9px 12px;
      border-radius: var(--gem-radius);
      max-width: 89%;
      word-wrap: break-word;
      position: relative;
      margin-right: 5px;
  }

  .message.ai {
      background: var(--gem-surface);
      margin-right: auto;
  }

  .message.user {
      background: var(--gem-accent-surface);
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

function createSvgIcon(paths: readonly string[]): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");

  paths.forEach((pathData) => {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", pathData);
    svg.appendChild(path);
  });

  return svg;
}

function createActionButton(label: string, paths: readonly string[]): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "popup-action-button";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.appendChild(createSvgIcon(paths));
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
    showMainView();
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

  const mainView = document.createElement("div");
  mainView.className = "popup-main-view";
  popup.appendChild(mainView);

  const chatContainer = document.createElement("div");
  chatContainer.className = "chat-container";
  mainView.appendChild(chatContainer);

  const quickPromptsContainer = document.createElement("div");
  quickPromptsContainer.className = "quick-prompts";
  const quickPromptButtons = new Map<string, HTMLButtonElement>();

  options.quickPrompts.forEach((prompt) => {
    const button = createQuickPromptButton(prompt.label);
    quickPromptButtons.set(prompt.label, button);
    quickPromptsContainer.appendChild(button);
  });
  mainView.appendChild(quickPromptsContainer);

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
  mainView.appendChild(inputContainer);

  const popupActions = document.createElement("div");
  popupActions.className = "popup-actions";

  const copyButton = createActionButton("Copy conversation history", [
    "M8 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2Z",
    "M16 8V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h2",
  ]);
  const copyIcon = copyButton.firstChild?.cloneNode(true);
  copyButton.addEventListener("click", () => {
    const dump = options.getConversationDump();
    void navigator.clipboard.writeText(dump || "no history").then(() => {
      copyButton.replaceChildren(createSvgIcon(["m5 12 4 4L19 6"]));
      window.setTimeout(() => {
        if (copyIcon) copyButton.replaceChildren(copyIcon.cloneNode(true));
      }, 800);
    });
  });
  popupActions.appendChild(copyButton);

  const settingsButton = createActionButton("Open settings", [
    "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.09a2 2 0 0 1 1 1.74v.5a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z",
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  ]);
  popupActions.appendChild(settingsButton);
  mainView.appendChild(popupActions);

  const settingsView = document.createElement("div");
  settingsView.className = "settings-view";
  settingsView.style.display = "none";

  const settingsHeader = document.createElement("div");
  settingsHeader.className = "settings-header";
  const backButton = document.createElement("button");
  backButton.type = "button";
  backButton.className = "settings-back-button";
  backButton.title = "Back";
  backButton.setAttribute("aria-label", "Back");
  backButton.appendChild(createSvgIcon(["m15 18-6-6 6-6"]));
  const settingsTitle = document.createElement("h2");
  settingsTitle.className = "settings-title";
  settingsTitle.textContent = "Keyboard shortcuts";
  const settingsSubtitle = document.createElement("p");
  settingsSubtitle.className = "settings-subtitle";
  settingsSubtitle.textContent = "Customize how you open the analyzer";
  const settingsHeaderCopy = document.createElement("div");
  settingsHeaderCopy.append(settingsTitle, settingsSubtitle);
  settingsHeader.append(backButton, settingsHeaderCopy);
  settingsView.appendChild(settingsHeader);

  const settingsCard = document.createElement("div");
  settingsCard.className = "settings-card";
  const sectionTitle = document.createElement("div");
  sectionTitle.className = "settings-section-title";
  sectionTitle.textContent = "Analyze selected text";
  const sectionDescription = document.createElement("p");
  sectionDescription.className = "settings-section-description";
  sectionDescription.textContent = "Run analysis for the current selection";
  const shortcutList = document.createElement("div");
  shortcutList.className = "shortcut-list";
  settingsCard.append(sectionTitle, sectionDescription, shortcutList);
  const addShortcutButton = document.createElement("button");
  addShortcutButton.type = "button";
  addShortcutButton.className = "shortcut-add-button";
  addShortcutButton.textContent = "+ Add shortcut";
  addShortcutButton.title = "Add shortcut";
  addShortcutButton.setAttribute("aria-label", "Add shortcut");
  const shortcutHelp = document.createElement("div");
  shortcutHelp.className = "shortcut-help";
  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.className = "settings-save-button";
  saveButton.textContent = "Save";
  const settingsFooter = document.createElement("div");
  settingsFooter.className = "settings-footer";
  settingsFooter.append(shortcutHelp, saveButton);
  settingsView.append(settingsCard, addShortcutButton, settingsFooter);
  popup.appendChild(settingsView);

  let persistedAnalyzeShortcuts = options.initialAnalyzeShortcuts.map((shortcut) => ({ ...shortcut }));
  let analyzeShortcuts = persistedAnalyzeShortcuts.map((shortcut) => ({ ...shortcut }));
  let recordingIndex: number | null = null;

  function showMainView(): void {
    recordingIndex = null;
    analyzeShortcuts = persistedAnalyzeShortcuts.map((shortcut) => ({ ...shortcut }));
    shortcutHelp?.classList.remove("error");
    if (shortcutHelp) shortcutHelp.textContent = "";
    if (mainView) mainView.style.display = "block";
    if (settingsView) settingsView.style.display = "none";
  }

  function renderShortcuts(): void {
    shortcutList.textContent = "";
    shortcutHelp.textContent = recordingIndex === null ? "" : "Press a shortcut, or Esc to cancel";
    shortcutHelp.classList.remove("error");

    const rowCount = analyzeShortcuts.length + (recordingIndex === analyzeShortcuts.length ? 1 : 0);
    for (let index = 0; index < rowCount; index += 1) {
      const row = document.createElement("div");
      row.className = "shortcut-row";
      const recordButton = document.createElement("button");
      recordButton.type = "button";
      recordButton.className = "shortcut-record-button";
      const isRecording = recordingIndex === index;
      if (isRecording) {
        recordButton.classList.add("is-recording");
        recordButton.textContent = "Press shortcut…";
      } else {
        const shortcut = analyzeShortcuts[index];
        if (shortcut) {
          formatShortcutParts(shortcut).forEach((part) => {
            const keycap = document.createElement("span");
            keycap.className = "shortcut-keycap";
            keycap.textContent = part;
            recordButton.appendChild(keycap);
          });
        }
      }
      recordButton.setAttribute("aria-label", isRecording ? "Record shortcut" : "Change shortcut");
      recordButton.addEventListener("click", () => {
        recordingIndex = index;
        renderShortcuts();
      });
      recordButton.addEventListener("keydown", (event) => {
        if (recordingIndex !== index) return;
        event.preventDefault();
        event.stopPropagation();
        if (event.key === "Escape") {
          recordingIndex = null;
          renderShortcuts();
          return;
        }

        const shortcut = shortcutFromKeyboardEvent(event);
        if (!shortcut) {
          shortcutHelp.textContent = "Use ⌘, Ctrl, or Option with another key";
          shortcutHelp.classList.add("error");
          return;
        }

        const duplicateIndex = analyzeShortcuts.findIndex(
          (candidate, candidateIndex) => candidateIndex !== index && shortcutsEqual(candidate, shortcut)
        );
        if (duplicateIndex !== -1) {
          shortcutHelp.textContent = "This shortcut is already added";
          shortcutHelp.classList.add("error");
          return;
        }

        if (index === analyzeShortcuts.length) analyzeShortcuts.push(shortcut);
        else analyzeShortcuts[index] = shortcut;
        recordingIndex = null;
        renderShortcuts();
      });

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "shortcut-delete-button";
      deleteButton.title = index < analyzeShortcuts.length ? "Delete shortcut" : "Cancel";
      deleteButton.setAttribute("aria-label", deleteButton.title);
      if (index < analyzeShortcuts.length) {
        deleteButton.appendChild(createSvgIcon([
          "M3 6h18",
          "M8 6V4h8v2",
          "M19 6l-1 15H6L5 6",
          "M10 11v6M14 11v6",
        ]));
      } else {
        deleteButton.textContent = "×";
      }
      deleteButton.addEventListener("click", () => {
        if (index < analyzeShortcuts.length) {
          analyzeShortcuts.splice(index, 1);
        }
        recordingIndex = null;
        renderShortcuts();
      });
      row.append(recordButton, deleteButton);
      shortcutList.appendChild(row);

      if (isRecording) queueMicrotask(() => recordButton.focus());
    }
  }

  settingsButton.addEventListener("click", () => {
    analyzeShortcuts = persistedAnalyzeShortcuts.map((shortcut) => ({ ...shortcut }));
    mainView.style.display = "none";
    settingsView.style.display = "block";
    renderShortcuts();
  });
  backButton.addEventListener("click", showMainView);
  addShortcutButton.addEventListener("click", () => {
    recordingIndex = analyzeShortcuts.length;
    renderShortcuts();
  });
  saveButton.addEventListener("click", () => {
    persistedAnalyzeShortcuts = analyzeShortcuts.map((shortcut) => ({ ...shortcut }));
    options.onAnalyzeShortcutsChange(persistedAnalyzeShortcuts);
    saveButton.textContent = "Saved";
    window.setTimeout(() => {
      saveButton.textContent = "Save";
    }, 800);
  });
  renderShortcuts();

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
    settingsView,
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
    setAnalyzeShortcuts(shortcuts) {
      persistedAnalyzeShortcuts = shortcuts.map((shortcut) => ({ ...shortcut }));
      analyzeShortcuts = persistedAnalyzeShortcuts.map((shortcut) => ({ ...shortcut }));
      recordingIndex = null;
      renderShortcuts();
    },
    showMovieModeNotification,
    showProviderNotification,
  };
}
