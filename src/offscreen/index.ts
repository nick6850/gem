interface PlayAudioMessage {
  play: {
    source: string;
  };
}

function isPlayAudioMessage(message: unknown): message is PlayAudioMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    "play" in message &&
    typeof message.play === "object" &&
    message.play !== null &&
    "source" in message.play &&
    typeof message.play.source === "string"
  );
}

let audio: HTMLAudioElement | null = null;

function playAudio({ source }: PlayAudioMessage["play"]): void {
  audio = new Audio(source);
  void audio.play();
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (isPlayAudioMessage(message)) {
    playAudio(message.play);
    sendResponse(true);
    return true;
  }

  return false;
});
