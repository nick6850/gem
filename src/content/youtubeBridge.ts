const REQUEST_SOURCE = "gem-youtube-context-content";
const RESPONSE_SOURCE = "gem-youtube-context-page";
const REQUEST_TYPE = "get-caption-state";

interface TextValue {
  simpleText?: string;
  runs?: Array<{ text?: string }>;
}

interface RawCaptionTrack {
  baseUrl?: string;
  languageCode?: string;
  vssId?: string;
  vss_id?: string;
  kind?: string;
  name?: TextValue | string;
  displayName?: string;
  isTranslatable?: boolean;
}

interface PlayerResponse {
  videoDetails?: { videoId?: string; title?: string };
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: RawCaptionTrack[];
    };
  };
}

interface YouTubePlayerElement extends HTMLElement {
  getPlayerResponse?: () => PlayerResponse;
  getOption?: (module: string, option: string) => unknown;
  getCurrentTime?: () => number;
}

interface PageWindow extends Window {
  ytInitialPlayerResponse?: PlayerResponse;
}

function textValue(value: TextValue | string | undefined): string {
  if (typeof value === "string") return value;
  if (typeof value?.simpleText === "string") return value.simpleText;
  return value?.runs?.map((run) => run.text ?? "").join("") ?? "";
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function stringProperty(value: Record<string, unknown> | null, ...keys: string[]): string {
  for (const key of keys) {
    const property = value?.[key];
    if (typeof property === "string") return property;
  }
  return "";
}

function serializeActiveTrack(value: unknown): Record<string, string> | null {
  const activeTrack = record(value);
  if (!activeTrack) return null;

  const translationLanguage = record(activeTrack.translationLanguage);
  const activeName = activeTrack.name;
  const serialized = {
    languageCode: stringProperty(activeTrack, "languageCode", "language_code"),
    vssId: stringProperty(activeTrack, "vssId", "vss_id"),
    kind: stringProperty(activeTrack, "kind"),
    name: stringProperty(activeTrack, "displayName") || textValue(
      typeof activeName === "string" || (activeName && typeof activeName === "object")
        ? activeName as TextValue | string
        : undefined
    ),
    translationLanguageCode: stringProperty(translationLanguage, "languageCode", "language_code"),
  };

  return Object.values(serialized).some(Boolean) ? serialized : null;
}

function readCaptionState(): Record<string, unknown> {
  const player = document.querySelector<YouTubePlayerElement>("#movie_player");
  const pageWindow = window as PageWindow;
  const playerResponse = player?.getPlayerResponse?.() ?? pageWindow.ytInitialPlayerResponse;
  const rawTracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  const captionTracks = rawTracks.flatMap((track) => {
    if (!track.baseUrl || !track.languageCode) return [];
    return [{
      baseUrl: track.baseUrl,
      languageCode: track.languageCode,
      vssId: track.vssId ?? track.vss_id ?? "",
      kind: track.kind ?? "",
      name: textValue(track.name) || track.displayName || "",
      isTranslatable: track.isTranslatable === true,
    }];
  });
  const video = document.querySelector<HTMLVideoElement>("video");
  const currentTime = player?.getCurrentTime?.() ?? video?.currentTime ?? 0;

  return {
    videoId: playerResponse?.videoDetails?.videoId ?? new URL(location.href).searchParams.get("v") ?? "",
    title: playerResponse?.videoDetails?.title ?? document.title.replace(/\s+-\s+YouTube$/, ""),
    currentTime: Number.isFinite(currentTime) ? currentTime : 0,
    activeTrack: serializeActiveTrack(player?.getOption?.("captions", "track")),
    captionTracks,
  };
}

window.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (event.source !== window) return;
  const message = record(event.data);
  if (
    message?.source !== REQUEST_SOURCE ||
    message.type !== REQUEST_TYPE ||
    typeof message.requestId !== "string"
  ) {
    return;
  }

  window.postMessage({
    source: RESPONSE_SOURCE,
    type: REQUEST_TYPE,
    requestId: message.requestId,
    state: readCaptionState(),
  }, "*");
});
