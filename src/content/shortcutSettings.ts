export interface ShortcutBinding {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

const STORAGE_KEY = "analyzeShortcuts";

export const DEFAULT_ANALYZE_SHORTCUTS: readonly ShortcutBinding[] = [
  {
    key: "z",
    metaKey: true,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
  },
];

function cloneShortcuts(shortcuts: readonly ShortcutBinding[]): ShortcutBinding[] {
  return shortcuts.map((shortcut) => ({ ...shortcut }));
}

function isShortcutBinding(value: unknown): value is ShortcutBinding {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ShortcutBinding>;
  return (
    typeof candidate.key === "string" &&
    candidate.key.length > 0 &&
    typeof candidate.metaKey === "boolean" &&
    typeof candidate.ctrlKey === "boolean" &&
    typeof candidate.altKey === "boolean" &&
    typeof candidate.shiftKey === "boolean"
  );
}

function getStorageArea(): chrome.storage.StorageArea | null {
  return typeof chrome !== "undefined" && chrome.storage?.local ? chrome.storage.local : null;
}

export function loadAnalyzeShortcuts(): Promise<ShortcutBinding[]> {
  const storage = getStorageArea();
  if (!storage) {
    return Promise.resolve(cloneShortcuts(DEFAULT_ANALYZE_SHORTCUTS));
  }

  return new Promise((resolve) => {
    storage.get(STORAGE_KEY, (result) => {
      const stored = result[STORAGE_KEY];
      if (Array.isArray(stored) && stored.every(isShortcutBinding)) {
        resolve(cloneShortcuts(stored));
        return;
      }

      const defaults = cloneShortcuts(DEFAULT_ANALYZE_SHORTCUTS);
      storage.set({ [STORAGE_KEY]: defaults });
      resolve(defaults);
    });
  });
}

export function saveAnalyzeShortcuts(shortcuts: readonly ShortcutBinding[]): Promise<void> {
  const storage = getStorageArea();
  if (!storage) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    storage.set({ [STORAGE_KEY]: cloneShortcuts(shortcuts) }, resolve);
  });
}

function normalizedKey(key: string): string {
  return key.length === 1 ? key.toLocaleLowerCase() : key;
}

export function shortcutFromKeyboardEvent(event: KeyboardEvent): ShortcutBinding | null {
  if (["Meta", "Control", "Alt", "Shift"].includes(event.key)) {
    return null;
  }

  if (!event.metaKey && !event.ctrlKey && !event.altKey) {
    return null;
  }

  return {
    key: normalizedKey(event.key),
    metaKey: event.metaKey,
    ctrlKey: event.ctrlKey,
    altKey: event.altKey,
    shiftKey: event.shiftKey,
  };
}

export function shortcutMatchesEvent(shortcut: ShortcutBinding, event: KeyboardEvent): boolean {
  return (
    shortcut.key === normalizedKey(event.key) &&
    shortcut.metaKey === event.metaKey &&
    shortcut.ctrlKey === event.ctrlKey &&
    shortcut.altKey === event.altKey &&
    shortcut.shiftKey === event.shiftKey
  );
}

export function shortcutsEqual(left: ShortcutBinding, right: ShortcutBinding): boolean {
  return (
    left.key === right.key &&
    left.metaKey === right.metaKey &&
    left.ctrlKey === right.ctrlKey &&
    left.altKey === right.altKey &&
    left.shiftKey === right.shiftKey
  );
}

function displayKey(key: string): string {
  const labels: Record<string, string> = {
    " ": "Space",
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
    Escape: "Esc",
    Backspace: "⌫",
    Delete: "⌦",
    Enter: "↵",
    Tab: "⇥",
  };

  return labels[key] ?? (key.length === 1 ? key.toLocaleUpperCase() : key);
}

export function formatShortcut(shortcut: ShortcutBinding): string {
  return formatShortcutParts(shortcut).join("");
}

export function formatShortcutParts(shortcut: ShortcutBinding): string[] {
  const parts: string[] = [];
  if (shortcut.ctrlKey) parts.push("⌃");
  if (shortcut.altKey) parts.push("⌥");
  if (shortcut.shiftKey) parts.push("⇧");
  if (shortcut.metaKey) parts.push("⌘");
  parts.push(displayKey(shortcut.key));
  return parts;
}
