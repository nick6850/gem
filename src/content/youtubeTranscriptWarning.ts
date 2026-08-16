const STORAGE_KEY = "youtubeTranscriptFailure";

function getStorageArea(): chrome.storage.StorageArea | null {
  return typeof chrome !== "undefined" && chrome.storage?.local ? chrome.storage.local : null;
}

export function loadYouTubeTranscriptFailure(): Promise<string | null> {
  const storage = getStorageArea();
  if (!storage) return Promise.resolve(null);

  return new Promise((resolve) => {
    storage.get(STORAGE_KEY, (result) => {
      const value = result[STORAGE_KEY];
      resolve(typeof value === "string" && value.trim() ? value : null);
    });
  });
}

export function saveYouTubeTranscriptFailure(reason: string | null): Promise<void> {
  const storage = getStorageArea();
  if (!storage) return Promise.resolve();

  return new Promise((resolve) => {
    storage.set({ [STORAGE_KEY]: reason }, resolve);
  });
}
