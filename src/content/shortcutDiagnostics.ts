import { shortcutMatchesEvent, type ShortcutBinding } from "./shortcutSettings";

const DEBUG_COMMAND_CODE = "Digit6";
const RECORDING_SESSION_KEY = "gem.shortcutDiagnostics.recording";
const STATUS_ELEMENT_ID = "gem-shortcut-diagnostics-status";
const MAX_TIMELINE_ENTRIES = 160;
const MAX_TEXT_LENGTH = 300;

interface DiagnosticEntry {
  at: string;
  type: string;
  details: unknown;
}

interface CaptionMutationStats {
  added: number;
  removed: number;
  selectionNodeRemoved: number;
  lastMutationAt: string | null;
}

function timestamp(): string {
  return new Date().toISOString();
}

function clippedText(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= MAX_TEXT_LENGTH
    ? normalized
    : `${normalized.slice(0, MAX_TEXT_LENGTH)}…`;
}

function describeNode(node: Node | null): string | null {
  if (!node) return null;
  if (node.nodeType === Node.TEXT_NODE) {
    return `#text(${describeNode(node.parentElement) ?? "detached"})`;
  }
  if (!(node instanceof Element)) return node.nodeName;

  const id = node.id ? `#${node.id}` : "";
  const classes = [...node.classList].slice(0, 4).map((name) => `.${name}`).join("");
  return `${node.tagName.toLocaleLowerCase()}${id}${classes}`;
}

function getSelectionSnapshot(): Record<string, unknown> {
  const selection = window.getSelection();
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null;

  return {
    text: clippedText(selection?.toString() ?? ""),
    rangeCount: selection?.rangeCount ?? 0,
    collapsed: selection?.isCollapsed ?? null,
    anchorNode: describeNode(selection?.anchorNode ?? null),
    focusNode: describeNode(selection?.focusNode ?? null),
    rangeStartConnected: range?.startContainer.isConnected ?? null,
    rangeEndConnected: range?.endContainer.isConnected ?? null,
  };
}

function getUISnapshot(): Record<string, unknown> {
  const host = document.querySelector("#my-ai-helper-host");
  const root = host?.shadowRoot;
  const popup = root?.querySelector<HTMLElement>(".popup");
  const overlay = root?.querySelector<HTMLElement>(".popup-overlay");

  return {
    hostPresent: Boolean(host),
    hostConnected: host?.isConnected ?? false,
    popupDisplay: popup?.style.display ?? null,
    popupVisibility: popup?.style.visibility ?? null,
    overlayDisplay: overlay?.style.display ?? null,
    messageCount: root?.querySelectorAll(".message").length ?? 0,
  };
}

function getCaptionSnapshot(): Array<Record<string, unknown>> {
  return [...document.querySelectorAll<HTMLElement>(".ytp-caption-segment")].slice(0, 8).map((caption) => {
    const rect = caption.getBoundingClientRect();
    return {
      text: clippedText(caption.textContent ?? ""),
      connected: caption.isConnected,
      userSelect: getComputedStyle(caption).userSelect,
      pointerEvents: getComputedStyle(caption).pointerEvents,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    };
  });
}

function getKeyboardSnapshot(event: KeyboardEvent): Record<string, unknown> {
  return {
    key: event.key,
    code: event.code,
    location: event.location,
    metaKey: event.metaKey,
    ctrlKey: event.ctrlKey,
    altKey: event.altKey,
    shiftKey: event.shiftKey,
    repeat: event.repeat,
    isComposing: event.isComposing,
    trusted: event.isTrusted,
    defaultPrevented: event.defaultPrevented,
    target: describeNode(event.target instanceof Node ? event.target : null),
    path: event.composedPath().slice(0, 8).map((item) =>
      item instanceof Node ? describeNode(item) : String(item)
    ),
  };
}

function isDebugCommand(event: KeyboardEvent): boolean {
  return (
    event.code === DEBUG_COMMAND_CODE &&
    event.metaKey &&
    event.shiftKey &&
    !event.ctrlKey &&
    !event.altKey
  );
}

async function readPersistedShortcuts(): Promise<unknown> {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return null;

  return new Promise((resolve) => {
    chrome.storage.local.get("analyzeShortcuts", (result) => {
      const error = chrome.runtime?.lastError;
      resolve(error ? { error: error.message } : (result.analyzeShortcuts ?? null));
    });
  });
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.cssText = "position:fixed;left:-10000px;top:-10000px;opacity:0;";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) throw new Error("Clipboard write failed");
  }
}

function recordingWasEnabled(): boolean {
  try {
    return sessionStorage.getItem(RECORDING_SESSION_KEY) === "true";
  } catch {
    return false;
  }
}

function persistRecordingState(enabled: boolean): void {
  try {
    if (enabled) sessionStorage.setItem(RECORDING_SESSION_KEY, "true");
    else sessionStorage.removeItem(RECORDING_SESSION_KEY);
  } catch {
    // Diagnostics still work for the current page when session storage is unavailable.
  }
}

class ShortcutDiagnosticRecorder {
  private readonly timeline: DiagnosticEntry[] = [];
  private readonly mutationStats: CaptionMutationStats = {
    added: 0,
    removed: 0,
    selectionNodeRemoved: 0,
    lastMutationAt: null,
  };
  private recording = false;
  private mutationObserver: MutationObserver | null = null;
  private lastSelectionNode: Node | null = null;
  private statusTimer: number | null = null;

  constructor(private readonly getActiveShortcuts: () => readonly ShortcutBinding[]) {
    window.addEventListener("keydown", this.handleWindowKeydown, true);
    if (recordingWasEnabled()) this.startRecording(true);
  }

  private readonly record = (type: string, details: unknown): void => {
    if (!this.recording) return;
    this.timeline.push({ at: timestamp(), type, details });
    if (this.timeline.length > MAX_TIMELINE_ENTRIES) this.timeline.shift();
  };

  private readonly startRecording = (resumed = false): void => {
    if (this.recording) return;

    this.timeline.length = 0;
    this.mutationStats.added = 0;
    this.mutationStats.removed = 0;
    this.mutationStats.selectionNodeRemoved = 0;
    this.mutationStats.lastMutationAt = null;
    this.lastSelectionNode = null;
    this.recording = true;
    persistRecordingState(true);

    document.addEventListener("keydown", this.handleDocumentKeydown, true);
    window.addEventListener("keyup", this.handleKeyup, true);
    document.addEventListener("selectionchange", this.handleSelectionChange, true);
    window.addEventListener("mousedown", this.handlePointerEvent, true);
    window.addEventListener("mouseup", this.handlePointerEvent, true);
    window.addEventListener("selectstart", this.handlePointerEvent, true);

    if (document.body) {
      this.mutationObserver = new MutationObserver(this.handleMutations);
      this.mutationObserver.observe(document.body, { childList: true, subtree: true });
    }

    this.record(resumed ? "diagnostics-resumed" : "diagnostics-started", this.snapshot());
    this.showStatus(resumed ? "Diagnostics recording resumed" : "Diagnostics recording ON");
  };

  private readonly stopRecording = (): void => {
    this.record("diagnostics-stopped", this.snapshot());
    this.recording = false;
    persistRecordingState(false);

    document.removeEventListener("keydown", this.handleDocumentKeydown, true);
    window.removeEventListener("keyup", this.handleKeyup, true);
    document.removeEventListener("selectionchange", this.handleSelectionChange, true);
    window.removeEventListener("mousedown", this.handlePointerEvent, true);
    window.removeEventListener("mouseup", this.handlePointerEvent, true);
    window.removeEventListener("selectstart", this.handlePointerEvent, true);
    this.mutationObserver?.disconnect();
    this.mutationObserver = null;
    this.lastSelectionNode = null;
  };

  private readonly snapshot = (): Record<string, unknown> => ({
    selection: getSelectionSnapshot(),
    ui: getUISnapshot(),
    captions: getCaptionSnapshot(),
    activeElement: describeNode(document.activeElement),
    documentHasFocus: document.hasFocus(),
    visibilityState: document.visibilityState,
  });

  private readonly handleWindowKeydown = (event: KeyboardEvent): void => {
    if (isDebugCommand(event)) {
      event.preventDefault();
      event.stopImmediatePropagation();

      if (!this.recording) {
        this.startRecording();
        return;
      }

      this.record("diagnostics-stop-command", {
        event: getKeyboardSnapshot(event),
        state: this.snapshot(),
      });
      this.stopRecording();
      this.showStatus("Copying diagnostics…");
      void this.copyReport();
      return;
    }

    if (!this.recording) return;

    const shortcuts = [...this.getActiveShortcuts()];
    const matches = shortcuts.map((shortcut, index) =>
      shortcutMatchesEvent(shortcut, event) ? index : -1
    ).filter((index) => index !== -1);

    this.record("keydown-window-capture", {
      event: getKeyboardSnapshot(event),
      activeShortcuts: shortcuts,
      matchingShortcutIndexes: matches,
      state: this.snapshot(),
    });

    if (matches.length > 0) {
      queueMicrotask(() => this.record("shortcut-after-microtask", this.snapshot()));
      window.setTimeout(() => this.record("shortcut-after-50ms", this.snapshot()), 50);
      window.setTimeout(() => this.record("shortcut-after-500ms", this.snapshot()), 500);
    }
  };

  private readonly handleDocumentKeydown = (event: KeyboardEvent): void => {
    this.record("keydown-document-capture", getKeyboardSnapshot(event));
  };

  private readonly handleKeyup = (event: KeyboardEvent): void => {
    this.record("keyup-window-capture", getKeyboardSnapshot(event));
  };

  private readonly handleSelectionChange = (): void => {
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && selection.toString().trim()) {
      this.lastSelectionNode = selection.anchorNode;
    }
    this.record("selectionchange", this.snapshot());
  };

  private readonly handlePointerEvent = (event: Event): void => {
    const mouse = event instanceof MouseEvent ? { button: event.button, buttons: event.buttons } : {};
    this.record(event.type, {
      ...mouse,
      target: describeNode(event.target instanceof Node ? event.target : null),
      selection: getSelectionSnapshot(),
    });
  };

  private readonly handleMutations = (mutations: MutationRecord[]): void => {
    for (const mutation of mutations) {
      this.mutationStats.added += mutation.addedNodes.length;
      this.mutationStats.removed += mutation.removedNodes.length;
      this.mutationStats.lastMutationAt = timestamp();

      if (this.lastSelectionNode) {
        for (const removed of mutation.removedNodes) {
          if (removed === this.lastSelectionNode || removed.contains(this.lastSelectionNode)) {
            this.mutationStats.selectionNodeRemoved += 1;
            this.record("selected-node-removed", {
              removed: describeNode(removed),
              lastSelectionNode: describeNode(this.lastSelectionNode),
              state: this.snapshot(),
            });
          }
        }
      }
    }
  };

  private readonly copyReport = async (): Promise<void> => {
    const environment = {
      url: window.location.href,
      topFrame: window.top === window.self,
      readyState: document.readyState,
      visibilityState: document.visibilityState,
      documentHasFocus: document.hasFocus(),
      platform: navigator.platform,
      language: navigator.language,
    };
    const activeShortcuts = [...this.getActiveShortcuts()];
    const currentState = this.snapshot();
    const captionMutations = { ...this.mutationStats };
    const timeline = this.timeline.slice();
    const persistedShortcuts = await readPersistedShortcuts();

    const report = {
      version: 1,
      generatedAt: timestamp(),
      environment,
      shortcuts: {
        active: activeShortcuts,
        persisted: persistedShortcuts,
      },
      currentState,
      captionMutations,
      timeline,
    };

    const text = JSON.stringify(report, null, 2);
    try {
      await copyText(text);
      this.showStatus("Diagnostics copied to clipboard");
      console.info("[Text Analyzer] Shortcut diagnostics copied to clipboard.");
    } catch (error) {
      this.showStatus("Could not copy diagnostics", true);
      console.error("[Text Analyzer] Could not copy shortcut diagnostics.", error);
    }
  };

  private readonly showStatus = (message: string, isError = false): void => {
    let status = document.getElementById(STATUS_ELEMENT_ID);
    if (!(status instanceof HTMLDivElement)) {
      status = document.createElement("div");
      status.id = STATUS_ELEMENT_ID;
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");
      document.body.appendChild(status);
    }

    status.textContent = message;
    status.style.cssText = [
      "position:fixed",
      "left:50%",
      "top:50%",
      "transform:translate(-50%,-50%)",
      "z-index:2147483647",
      "pointer-events:none",
      "padding:11px 16px",
      "border-radius:10px",
      "border:1px solid rgba(255,255,255,.16)",
      `background:${isError ? "rgba(153,27,27,.96)" : "rgba(24,24,27,.96)"}`,
      "box-shadow:0 10px 30px rgba(0,0,0,.3)",
      "color:#fff",
      "font:600 13px/1.35 -apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif",
      "letter-spacing:.01em",
    ].join(";");

    if (this.statusTimer !== null) window.clearTimeout(this.statusTimer);
    this.statusTimer = window.setTimeout(() => {
      status.remove();
      this.statusTimer = null;
    }, 1800);
  };
}

export function installShortcutDiagnostics(
  getActiveShortcuts: () => readonly ShortcutBinding[]
): void {
  new ShortcutDiagnosticRecorder(getActiveShortcuts);
}
