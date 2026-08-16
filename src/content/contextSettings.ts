const STORAGE_KEY = "lightContextEnabled";

export const DEFAULT_LIGHT_CONTEXT_ENABLED = true;

function getStorageArea(): chrome.storage.StorageArea | null {
  return typeof chrome !== "undefined" && chrome.storage?.local ? chrome.storage.local : null;
}

export function loadLightContextEnabled(): Promise<boolean> {
  const storage = getStorageArea();
  if (!storage) {
    return Promise.resolve(DEFAULT_LIGHT_CONTEXT_ENABLED);
  }

  return new Promise((resolve) => {
    storage.get(STORAGE_KEY, (result) => {
      const stored = result[STORAGE_KEY];
      if (typeof stored === "boolean") {
        resolve(stored);
        return;
      }

      storage.set({ [STORAGE_KEY]: DEFAULT_LIGHT_CONTEXT_ENABLED });
      resolve(DEFAULT_LIGHT_CONTEXT_ENABLED);
    });
  });
}

export function saveLightContextEnabled(enabled: boolean): Promise<void> {
  const storage = getStorageArea();
  if (!storage) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    storage.set({ [STORAGE_KEY]: enabled }, resolve);
  });
}
