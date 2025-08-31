async function createOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['AUDIO_PLAYBACK'],
      justification: 'testing' 
  });
}

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "playTTS") {
    const text = encodeURIComponent(message.text);
    const audio_url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${text}&tl=en&client=tw-ob`;
    playSound(audio_url);
    sendResponse({ success: true });
  }
  return true;
});

async function playSound(source) {
  try {
    await createOffscreen();
    chrome.runtime.sendMessage({ play: { source } });
  } catch (error) {
    console.error('Error playing sound:', error);
  }
}

