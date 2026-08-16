import type { LLMProvider, QuickPrompt, SelectionContext } from "../shared/types";
import { createContextExtractor } from "./contextExtractor";
import { ConversationStore } from "./conversationStore";
import { LLMService, extractOpenAIText } from "./llmService";
import { QUICK_PROMPTS } from "./quickPrompts";
import {
  DEFAULT_ANALYZE_SHORTCUTS,
  loadAnalyzeShortcuts,
  saveAnalyzeShortcuts,
  shortcutMatchesEvent,
  type ShortcutBinding,
} from "./shortcutSettings";
import { createExtensionUI, type ExtensionUI } from "./ui";
import { installShortcutDiagnostics } from "./shortcutDiagnostics";

const POPUP_VIEWPORT_MARGIN = 20;
const PROVIDER_CYCLE: readonly LLMProvider[] = ["openai", "local", "gemini"];

type ShortcutSelectionSource = "popup" | "document" | "cached";

interface ShortcutSelection {
  text: string;
  source: ShortcutSelectionSource;
}

function isLLMProvider(provider: string): provider is LLMProvider {
  return provider === "openai" || provider === "local" || provider === "gemini";
}

function getShadowSelection(root: ShadowRoot): Selection | null {
  const maybeSelectableRoot = root as ShadowRoot & { getSelection?: () => Selection | null };
  return typeof maybeSelectableRoot.getSelection === "function" ? maybeSelectableRoot.getSelection() : null;
}

function removeNodeIfAttached(node: Node): void {
  if (node.parentNode) {
    node.parentNode.removeChild(node);
  }
}

export function initContentController(): boolean {
  const conversationStore = new ConversationStore();
  const llmService = new LLMService(conversationStore);
  const getContextAroundSelection = createContextExtractor({
    getCurrentProvider: () => conversationStore.currentProvider,
    getSentenceContextCount: () => conversationStore.currentSentenceContextCount,
  });

  let lastSelectedText = "";
  let lastContextText = "";
  let originalText = "";
  let isLeftMouseDown = false;
  let analyzeShortcuts: ShortcutBinding[] = DEFAULT_ANALYZE_SHORTCUTS.map((shortcut) => ({ ...shortcut }));

  const maybeUI = createExtensionUI({
    quickPrompts: QUICK_PROMPTS,
    getConversationDump: () =>
      conversationStore
        .snapshot()
        .map((message) => `${message.role}: ${message.content}`)
        .join("\n\n"),
    initialAnalyzeShortcuts: analyzeShortcuts,
    onAnalyzeShortcutsChange: (shortcuts) => {
      analyzeShortcuts = shortcuts.map((shortcut) => ({ ...shortcut }));
      void saveAnalyzeShortcuts(analyzeShortcuts);
    },
    onClose: () => {
      conversationStore.reset();
    },
    onPlayTTS: (text) => {
      playTTS(text);
    },
  });

  if (!maybeUI) {
    return false;
  }
  const ui: ExtensionUI = maybeUI;
  installShortcutDiagnostics(() => analyzeShortcuts);

  void loadAnalyzeShortcuts().then((shortcuts) => {
    analyzeShortcuts = shortcuts;
    ui.setAnalyzeShortcuts(shortcuts);
  });

  function getCenteredPopupPosition(): { left: number; top: number } {
    const popupRect = ui.popup.getBoundingClientRect();
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

  function positionPopup(): void {
    ui.popup.style.display = "block";
    ui.popup.style.visibility = "hidden";
    ui.overlay.style.display = "block";

    ui.setPopupPosition(getCenteredPopupPosition());
    ui.popup.style.visibility = "visible";
    ui.enableClickOutsideClose();
  }

  function positionButton(rect: DOMRect): void {
    const buttonWidth = ui.floatingButton.offsetWidth;
    const buttonHeight = ui.floatingButton.offsetHeight;

    let left = rect.right + 5;
    let top = rect.top + rect.height / 2 - buttonHeight / 2;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    if (left + buttonWidth > viewportWidth) {
      left = rect.left - buttonWidth - 5;
    }
    if (left < 0) {
      left = 5;
    }

    if (top + buttonHeight > viewportHeight) {
      top = rect.bottom - buttonHeight - 5;
    }
    if (top < 0) {
      top = 5;
    }

    ui.floatingButton.style.left = `${left}px`;
    ui.floatingButton.style.top = `${top}px`;
  }

  function getContextFromPopupSelection(): SelectionContext | null {
    const selection = getShadowSelection(ui.shadowRoot);
    if (!selection || selection.rangeCount === 0) {
      return null;
    }

    const selectedText = selection.toString().trim();
    if (!selectedText) {
      return null;
    }

    const popupText = ui.chatContainer.innerText || ui.chatContainer.textContent || "";

    if (!popupText) {
      return {
        selectedText,
        contextBefore: "",
        contextAfter: "",
        fullContext: selectedText,
      };
    }

    const selectedIndex = popupText.indexOf(selectedText);

    if (selectedIndex === -1) {
      return {
        selectedText,
        contextBefore: "",
        contextAfter: "",
        fullContext: selectedText,
      };
    }

    const windowSize = 15;
    const textBefore = popupText.substring(0, selectedIndex);
    const textAfter = popupText.substring(selectedIndex + selectedText.length);
    const wordsBefore = textBefore.trim().split(/\s+/).filter(Boolean);
    const wordsAfter = textAfter.trim().split(/\s+/).filter(Boolean);
    const contextBefore = wordsBefore.slice(-windowSize).join(" ");
    const contextAfter = wordsAfter.slice(0, windowSize).join(" ");
    const fullContext = [contextBefore, selectedText, contextAfter].filter(Boolean).join(" ");

    return {
      selectedText,
      contextBefore,
      contextAfter,
      fullContext,
    };
  }

  function playTTS(text: string): void {
    chrome.runtime.sendMessage({ action: "playTTS", text });
  }

  function getShortcutSelection(): ShortcutSelection | null {
    const shadowSelection = getShadowSelection(ui.shadowRoot);
    if (shadowSelection && shadowSelection.rangeCount > 0 && shadowSelection.toString().trim()) {
      return {
        text: shadowSelection.toString().trim(),
        source: "popup",
      };
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

  function storeShortcutSelection(selection: ShortcutSelection): void {
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

  function buildQuickPromptText(aiPrompt: string): string {
    return aiPrompt.includes("${selectedText}")
      ? aiPrompt.replace("${selectedText}", lastSelectedText)
      : aiPrompt;
  }

  async function handleQuickPrompt(prompt: QuickPrompt): Promise<void> {
    if (!originalText) {
      return;
    }

    ui.addMessage(prompt.userMessage, false);

    const thinkingMessage = ui.addMessage("Typing...", true);
    thinkingMessage.classList.add("thinking");

    try {
      const response = await llmService.analyzeText(buildQuickPromptText(prompt.aiPrompt), "", true);
      removeNodeIfAttached(thinkingMessage);
      ui.addMessage(response, true);
    } catch (error) {
      removeNodeIfAttached(thinkingMessage);
      ui.addMessage("Error communicating with the service.", true);
      console.error(`${prompt.errorContext} error:`, error);
    }
  }

  async function startAnalysisSession({ logConversation = false } = {}): Promise<void> {
    if (!originalText) {
      return;
    }

    ui.clearMessages();
    conversationStore.reset();
    ui.addMessage("Analyzing...", true);
    positionPopup();
    ui.floatingButton.style.display = "none";

    try {
      console.log(
        "Sending API request for selectedText:",
        lastSelectedText,
        "context:",
        lastContextText
      );
      const analysis = await llmService.analyzeText(
        lastSelectedText,
        lastContextText.replace(/<<<SELECTED>>>|<<<\/SELECTED>>>/g, "")
      );
      console.log("Received analysis:", analysis);

      if (ui.popup.style.display === "none") {
        conversationStore.reset();
        return;
      }

      ui.clearMessages();
      ui.addMessage(originalText, false);
      ui.addMessage(analysis, true);

      if (logConversation) {
        console.log(
          "✅ Initial analysis complete. conversationHistory:",
          JSON.stringify(conversationStore.snapshot(), null, 2)
        );
      }

      positionPopup();
    } catch (error) {
      if (ui.popup.style.display !== "none") {
        ui.clearMessages();
        ui.addMessage("Error: Could not analyze text. Please try again.", true);
      }
      console.error("Analysis error:", error);
    }
  }

  function hasCommandModifier(event: KeyboardEvent): boolean {
    return event.ctrlKey || event.metaKey;
  }

  function setLLMProvider(provider: string): void {
    if (isLLMProvider(provider)) {
      conversationStore.setProvider(provider);
      console.log(`✅ Switched to ${provider.toUpperCase()} LLM provider`);
      console.log("💡 Switch providers: Ctrl/Cmd+1 or use setLLMProvider('openai'/'local'/'gemini')");
      ui.showProviderNotification(provider);
    } else {
      console.error(`❌ Invalid provider: ${provider}. Use 'openai', 'local', or 'gemini'`);
    }
  }

  function cycleProvider(): void {
    const currentIndex = PROVIDER_CYCLE.indexOf(conversationStore.currentProvider);
    const newProvider = PROVIDER_CYCLE[(currentIndex + 1) % PROVIDER_CYCLE.length] ?? "openai";
    setLLMProvider(newProvider);
    console.log(`🔄 Keyboard shortcut activated - switching to ${newProvider.toUpperCase()}`);
  }

  function toggleMovieMode(): void {
    const enabled = conversationStore.toggleMovieMode();
    ui.showMovieModeNotification(enabled);
    console.log(`🎬 Movie mode ${enabled ? "ENABLED" : "DISABLED"}`);
  }

  async function handleAnalyzeShortcut(event: KeyboardEvent): Promise<void> {
    event.preventDefault();
    event.stopPropagation();

    const selection = getShortcutSelection();
    if (selection) {
      storeShortcutSelection(selection);
      await startAnalysisSession({ logConversation: true });
    }
  }

  document.addEventListener("selectionchange", () => {
    if (isLeftMouseDown) {
      return;
    }

    const selection = window.getSelection();
    const selectedText = selection?.toString().trim() ?? "";

    if (!selection || !selectedText || selection.rangeCount === 0) {
      return;
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const { selectedText: cleanSelected, fullContext: context } = getContextAroundSelection();

    if (originalText && originalText !== cleanSelected) {
      conversationStore.reset();
    }

    lastSelectedText = cleanSelected;
    lastContextText = context;
    originalText = cleanSelected;

    positionButton(rect);

    window.setTimeout(() => {
      if (!isLeftMouseDown) {
        ui.floatingButton.style.display = "flex";
      }
    }, 500);
  });

  window.addEventListener("resize", () => {
    if (ui.popup.style.display !== "none") {
      ui.setPopupPosition(getCenteredPopupPosition());
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.composedPath().includes(ui.shadowRoot)) {
      return;
    }

    void (async () => {
      if (!event.repeat && analyzeShortcuts.some((shortcut) => shortcutMatchesEvent(shortcut, event))) {
        await handleAnalyzeShortcut(event);
        return;
      }

      if (hasCommandModifier(event) && event.key === "1") {
        event.preventDefault();
        event.stopPropagation();
        cycleProvider();
        return;
      }

      if (hasCommandModifier(event) && event.key === "2") {
        event.preventDefault();
        event.stopPropagation();
        toggleMovieMode();
      }
    })();
  }, { capture: true });

  ui.floatingButton.addEventListener("click", (event) => {
    void (async () => {
      event.preventDefault();
      event.stopPropagation();
      await startAnalysisSession();
    })();
  });

  document.addEventListener("mousedown", (event) => {
    if (event.button === 0) {
      isLeftMouseDown = true;
    }
  });

  document.addEventListener("mouseup", (event) => {
    if (event.button === 0) {
      isLeftMouseDown = false;
    }
  });

  async function handleUserInput(): Promise<void> {
    const userQuestion = ui.input.value.trim();
    if (!userQuestion) {
      return;
    }

    console.log(
      "📝 Follow-up requested. Current conversationHistory:",
      JSON.stringify(conversationStore.snapshot(), null, 2)
    );

    ui.addMessage(userQuestion, false);
    ui.input.value = "";

    const thinkingMessage = ui.addMessage("Typing...", true);
    thinkingMessage.classList.add("thinking");

    try {
      const response = await llmService.analyzeText(userQuestion, "", true);
      removeNodeIfAttached(thinkingMessage);
      ui.addMessage(response, true);
    } catch (error) {
      removeNodeIfAttached(thinkingMessage);
      ui.addMessage("Error communicating with the service.", true);
      console.error("Follow-up error:", error);
    }
  }

  ui.input.addEventListener("keypress", (event) => {
    if (event.key === "Enter") {
      void handleUserInput();
    }
  });

  QUICK_PROMPTS.forEach((prompt) => {
    ui.quickPromptButtons.get(prompt.label)?.addEventListener("click", () => {
      void handleQuickPrompt(prompt);
    });
  });

  document.addEventListener("click", (event) => {
    if (ui.popup.style.display !== "block" && !ui.floatingButton.contains(event.target as Node)) {
      ui.floatingButton.style.display = "none";
    }
  });

  window.setLLMProvider = setLLMProvider;
  window.analyzeText = (selectedText, context, isFollowUp = false) =>
    llmService.analyzeText(selectedText, context, isFollowUp);
  window.analyzeWithOpenAILLM = (selectedText, context, isFollowUp = false) =>
    llmService.analyzeWithProvider("openai", selectedText, context, isFollowUp);
  window.extractOpenAIText = extractOpenAIText;
  window.getContextAroundSelection = getContextAroundSelection;

  return true;
}
