interface PlayTTSMessage {
  action: "playTTS";
  text: string;
}

function isPlayTTSMessage(message: unknown): message is PlayTTSMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    "action" in message &&
    message.action === "playTTS" &&
    "text" in message &&
    typeof message.text === "string"
  );
}

async function createOffscreen(): Promise<void> {
  if (await chrome.offscreen.hasDocument()) {
    return;
  }

  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
    justification: "Play generated text-to-speech audio.",
  });
}

async function playSound(source: string): Promise<void> {
  try {
    await createOffscreen();
    chrome.runtime.sendMessage({ play: { source } });
  } catch (error) {
    console.error("Error playing sound:", error);
  }
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (isPlayTTSMessage(message)) {
    const text = encodeURIComponent(message.text);
    const audioUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${text}&tl=en&client=tw-ob`;
    void playSound(audioUrl);
    sendResponse({ success: true });
    return true;
  }

  return false;
});
