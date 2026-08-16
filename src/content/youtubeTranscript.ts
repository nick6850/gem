import type { SelectionPromptContext } from "../shared/types";

const REQUEST_SOURCE = "gem-youtube-context-content";
const RESPONSE_SOURCE = "gem-youtube-context-page";
const REQUEST_TYPE = "get-caption-state";
const TRANSCRIPT_WORD_LIMIT = 250;
const SECONDS_BEFORE_SELECTION = 45;
const SECONDS_AFTER_SELECTION = 15;

export interface YouTubeCaptionTrack {
  baseUrl: string;
  languageCode: string;
  vssId: string;
  kind: string;
  name: string;
  isTranslatable: boolean;
}

export interface YouTubeActiveCaptionTrack {
  languageCode: string;
  vssId: string;
  kind: string;
  name: string;
  translationLanguageCode: string;
}

export interface YouTubeCaptionState {
  videoId: string;
  title: string;
  currentTime: number;
  activeTrack: YouTubeActiveCaptionTrack | null;
  captionTracks: YouTubeCaptionTrack[];
}

export interface TranscriptCue {
  start: number;
  duration: number;
  text: string;
}

export type ExpandedYouTubeContextResult =
  | { ok: true; context: SelectionPromptContext }
  | { ok: false; reason: string };

interface TrackResolution {
  tracks: YouTubeCaptionTrack[];
  authoritative: boolean;
}

interface InnerTubeClientProfile {
  clientName: string;
  clientVersion: string;
  clientNameHeader: string;
  context: Record<string, unknown>;
}

// YouTube's WEB player increasingly returns exp=xpe caption URLs which need a
// runtime proof token. These public client profiles provide equivalent signed
// caption URLs without attempting to manufacture or persist a proof token.
// Keep multiple profiles because YouTube may retire individual client versions.
const INNERTUBE_CLIENT_PROFILES: readonly InnerTubeClientProfile[] = [
  {
    clientName: "IOS",
    clientVersion: "20.10.4",
    clientNameHeader: "5",
    context: {
      deviceMake: "Apple",
      deviceModel: "iPhone16,2",
      platform: "MOBILE",
      osName: "iOS",
      osVersion: "18.3.2.22D82",
    },
  },
  {
    clientName: "ANDROID_VR",
    clientVersion: "1.62.20",
    clientNameHeader: "28",
    context: {
      deviceMake: "Oculus",
      deviceModel: "Quest 3",
      platform: "MOBILE",
      osName: "Android",
      osVersion: "12L",
      androidSdkVersion: 32,
    },
  },
  {
    clientName: "MWEB",
    clientVersion: "2.20251209.01.00",
    clientNameHeader: "2",
    context: {
      platform: "MOBILE",
      osName: "iOS",
      osVersion: "17.5.1",
    },
  },
];

const transcriptCache = new Map<string, Promise<TranscriptCue[]>>();
const alternateTrackCache = new Map<string, Promise<YouTubeCaptionTrack[]>>();

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function stringProperty(value: Record<string, unknown>, key: string): string {
  return typeof value[key] === "string" ? value[key] : "";
}

function validateActiveTrack(value: unknown): YouTubeActiveCaptionTrack | null {
  const candidate = record(value);
  if (!candidate) return null;
  return {
    languageCode: stringProperty(candidate, "languageCode"),
    vssId: stringProperty(candidate, "vssId"),
    kind: stringProperty(candidate, "kind"),
    name: stringProperty(candidate, "name"),
    translationLanguageCode: stringProperty(candidate, "translationLanguageCode"),
  };
}

function validateCaptionTrack(value: unknown): YouTubeCaptionTrack | null {
  const candidate = record(value);
  if (!candidate) return null;
  const baseUrl = stringProperty(candidate, "baseUrl");
  const languageCode = stringProperty(candidate, "languageCode");
  if (!baseUrl || !languageCode) return null;
  return {
    baseUrl,
    languageCode,
    vssId: stringProperty(candidate, "vssId"),
    kind: stringProperty(candidate, "kind"),
    name: stringProperty(candidate, "name"),
    isTranslatable: candidate.isTranslatable === true,
  };
}

function localizedText(value: unknown): string {
  if (typeof value === "string") return value;
  const candidate = record(value);
  if (!candidate) return "";
  if (typeof candidate.simpleText === "string") return candidate.simpleText;
  if (!Array.isArray(candidate.runs)) return "";
  return candidate.runs
    .map((run) => {
      const runRecord = record(run);
      return runRecord && typeof runRecord.text === "string" ? runRecord.text : "";
    })
    .join("");
}

function captionTracksFromPlayerResponse(value: unknown): YouTubeCaptionTrack[] {
  const response = record(value);
  const captions = record(response?.captions);
  const renderer = record(captions?.playerCaptionsTracklistRenderer);
  if (!Array.isArray(renderer?.captionTracks)) return [];

  return renderer.captionTracks.flatMap((trackValue) => {
    const track = record(trackValue);
    if (!track) return [];
    const baseUrl = stringProperty(track, "baseUrl");
    const languageCode = stringProperty(track, "languageCode");
    if (!baseUrl || !languageCode) return [];
    return [{
      baseUrl,
      languageCode,
      vssId: stringProperty(track, "vssId") || stringProperty(track, "vss_id"),
      kind: stringProperty(track, "kind"),
      name: localizedText(track.name) || stringProperty(track, "displayName"),
      isTranslatable: track.isTranslatable === true,
    }];
  });
}

function validateCaptionState(value: unknown): YouTubeCaptionState | null {
  const candidate = record(value);
  if (!candidate || !Array.isArray(candidate.captionTracks)) return null;
  const captionTracks = candidate.captionTracks
    .map(validateCaptionTrack)
    .filter((track): track is YouTubeCaptionTrack => track !== null);
  const currentTime = typeof candidate.currentTime === "number" ? candidate.currentTime : 0;
  return {
    videoId: stringProperty(candidate, "videoId"),
    title: stringProperty(candidate, "title"),
    currentTime: Number.isFinite(currentTime) ? currentTime : 0,
    activeTrack: validateActiveTrack(candidate.activeTrack),
    captionTracks,
  };
}

async function requestCaptionState(): Promise<YouTubeCaptionState | null> {
  const requestId = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;

  return new Promise((resolve) => {
    const timeoutId = window.setTimeout(() => {
      window.removeEventListener("message", handleMessage);
      resolve(null);
    }, 2500);

    function handleMessage(event: MessageEvent<unknown>): void {
      if (event.source !== window) return;
      const message = record(event.data);
      if (
        message?.source !== RESPONSE_SOURCE ||
        message.type !== REQUEST_TYPE ||
        message.requestId !== requestId
      ) {
        return;
      }

      window.clearTimeout(timeoutId);
      window.removeEventListener("message", handleMessage);
      resolve(validateCaptionState(message.state));
    }

    window.addEventListener("message", handleMessage);
    window.postMessage({ source: REQUEST_SOURCE, type: REQUEST_TYPE, requestId }, "*");
  });
}

function normalizedIdentifier(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/^\.+/, "");
}

function normalizedText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function resolveActiveCaptionTracks(state: YouTubeCaptionState): TrackResolution {
  const active = state.activeTrack;
  if (!active) {
    return {
      tracks: state.captionTracks.length === 1 ? state.captionTracks : state.captionTracks,
      authoritative: state.captionTracks.length === 1,
    };
  }

  if (active.vssId) {
    const activeVssId = normalizedIdentifier(active.vssId);
    const exactVssMatches = state.captionTracks.filter(
      (track) => normalizedIdentifier(track.vssId) === activeVssId
    );
    if (exactVssMatches.length === 1) {
      return { tracks: exactVssMatches, authoritative: true };
    }
  }

  let matches = state.captionTracks.filter(
    (track) => track.languageCode.toLocaleLowerCase() === active.languageCode.toLocaleLowerCase()
  );
  if (active.kind) {
    const kindMatches = matches.filter(
      (track) => track.kind.toLocaleLowerCase() === active.kind.toLocaleLowerCase()
    );
    if (kindMatches.length > 0) matches = kindMatches;
  }
  if (active.name) {
    const nameMatches = matches.filter(
      (track) => track.name.toLocaleLowerCase() === active.name.toLocaleLowerCase()
    );
    if (nameMatches.length > 0) matches = nameMatches;
  }

  return {
    tracks: matches,
    authoritative: matches.length === 1,
  };
}

function captionUrl(track: YouTubeCaptionTrack, activeTrack: YouTubeActiveCaptionTrack | null): string {
  const url = new URL(track.baseUrl);
  if (!(url.hostname === "youtube.com" || url.hostname.endsWith(".youtube.com"))) {
    throw new Error("Unexpected YouTube caption host");
  }
  url.searchParams.set("fmt", "json3");
  if (activeTrack?.translationLanguageCode) {
    url.searchParams.set("tlang", activeTrack.translationLanguageCode);
  }
  return url.toString();
}

function requiresProofToken(track: YouTubeCaptionTrack): boolean {
  const url = new URL(track.baseUrl);
  return url.searchParams.get("exp") === "xpe" && !url.searchParams.has("pot");
}

export function parseCaptionPayload(payload: string): TranscriptCue[] {
  try {
    const parsed = JSON.parse(payload) as { events?: unknown[] };
    if (Array.isArray(parsed.events)) {
      return parsed.events.flatMap((eventValue) => {
        const event = record(eventValue);
        if (!event || !Array.isArray(event.segs) || event.aAppend === 1) return [];
        const startMs = typeof event.tStartMs === "number" ? event.tStartMs : Number(event.tStartMs);
        const durationMs = typeof event.dDurationMs === "number"
          ? event.dDurationMs
          : Number(event.dDurationMs);
        const text = event.segs
          .map((segment) => {
            const segmentRecord = record(segment);
            return segmentRecord && typeof segmentRecord.utf8 === "string" ? segmentRecord.utf8 : "";
          })
          .join("")
          .replace(/\s+/g, " ")
          .trim();
        if (!Number.isFinite(startMs) || !text) return [];
        return [{
          start: startMs / 1000,
          duration: Number.isFinite(durationMs) ? durationMs / 1000 : 0,
          text,
        }];
      });
    }
  } catch {
    // YouTube also serves XML caption formats from the same signed URL.
  }

  const documentNode = new DOMParser().parseFromString(payload, "text/xml");
  const paragraphCues = [...documentNode.querySelectorAll("p[t]")].flatMap((paragraph) => {
    const startMs = Number(paragraph.getAttribute("t"));
    const durationMs = Number(paragraph.getAttribute("d"));
    const text = (paragraph.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!Number.isFinite(startMs) || !text) return [];
    return [{ start: startMs / 1000, duration: durationMs / 1000, text }];
  });
  if (paragraphCues.length > 0) return paragraphCues;

  return [...documentNode.querySelectorAll("text[start]")].flatMap((element) => {
    const start = Number(element.getAttribute("start"));
    const duration = Number(element.getAttribute("dur"));
    const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!Number.isFinite(start) || !text) return [];
    return [{ start, duration: Number.isFinite(duration) ? duration : 0, text }];
  });
}

function fetchTranscript(
  track: YouTubeCaptionTrack,
  activeTrack: YouTubeActiveCaptionTrack | null
): Promise<TranscriptCue[]> {
  const url = captionUrl(track, activeTrack);
  const cached = transcriptCache.get(url);
  if (cached) return cached;

  const request = fetch(url)
    .then(async (response) => {
      if (!response.ok) throw new Error(`YouTube captions request failed with ${response.status}`);
      const cues = parseCaptionPayload(await response.text());
      if (cues.length === 0) throw new Error("YouTube returned an empty caption track");
      return cues;
    })
    .catch((error: unknown) => {
      transcriptCache.delete(url);
      throw error;
    });
  transcriptCache.set(url, request);
  return request;
}

async function fetchPlayerTracksWithClient(
  videoId: string,
  client: InnerTubeClientProfile
): Promise<YouTubeCaptionTrack[]> {
  const endpoint = new URL("/youtubei/v1/player?prettyPrint=false", window.location.origin);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-YouTube-Client-Name": client.clientNameHeader,
      "X-YouTube-Client-Version": client.clientVersion,
    },
    body: JSON.stringify({
      context: {
        client: {
          clientName: client.clientName,
          clientVersion: client.clientVersion,
          hl: "en",
          gl: "US",
          ...client.context,
        },
        user: { lockedSafetyMode: false },
        request: { useSsl: true },
      },
      videoId,
      contentCheckOk: true,
      racyCheckOk: true,
    }),
  });
  if (!response.ok) {
    throw new Error(`YouTube InnerTube player request failed with ${response.status}`);
  }
  const playerResponse: unknown = await response.json();
  const playabilityStatus = record(record(playerResponse)?.playabilityStatus);
  if (stringProperty(playabilityStatus ?? {}, "status") !== "OK") return [];
  return captionTracksFromPlayerResponse(playerResponse);
}

function fetchAlternateCaptionTracks(videoId: string): Promise<YouTubeCaptionTrack[]> {
  const cached = alternateTrackCache.get(videoId);
  if (cached) return cached;

  const request = (async () => {
    for (const client of INNERTUBE_CLIENT_PROFILES) {
      try {
        const tracks = await fetchPlayerTracksWithClient(videoId, client);
        if (tracks.length > 0) return tracks;
      } catch {
        // Try the next public YouTube client profile.
      }
    }
    return [];
  })().then((tracks) => {
    if (tracks.length === 0) alternateTrackCache.delete(videoId);
    return tracks;
  });
  alternateTrackCache.set(videoId, request);
  return request;
}

function cueMatchesSelection(cue: TranscriptCue, selectedText: string, currentTime: number): boolean {
  const selected = normalizedText(selectedText);
  const cueText = normalizedText(cue.text);
  const cueEnd = cue.start + Math.max(cue.duration, 1);
  return Boolean(selected) && cueText.includes(selected) && currentTime >= cue.start - 8 && currentTime <= cueEnd + 8;
}

function selectedCueIndex(cues: readonly TranscriptCue[], selectedText: string, currentTime: number): number {
  const selected = normalizedText(selectedText);
  let closestIndex = -1;
  let closestDistance = Number.POSITIVE_INFINITY;
  cues.forEach((cue, index) => {
    if (!normalizedText(cue.text).includes(selected)) return;
    const cueEnd = cue.start + Math.max(cue.duration, 1);
    const distance = currentTime < cue.start
      ? cue.start - currentTime
      : currentTime > cueEnd
        ? currentTime - cueEnd
        : 0;
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  });
  if (closestIndex !== -1) return closestIndex;

  // If YouTube's rendered caption differs from the fetched cue text, retain a
  // time-local fallback for choosing the excerpt, but do not mark an occurrence.
  closestDistance = Number.POSITIVE_INFINITY;
  cues.forEach((cue, index) => {
    const cueEnd = cue.start + Math.max(cue.duration, 1);
    const distance = currentTime < cue.start
      ? cue.start - currentTime
      : currentTime > cueEnd
        ? currentTime - cueEnd
        : 0;
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  });
  return closestIndex;
}

function splitSelectedOccurrence(
  text: string,
  selectedText: string,
  occurrenceIndex = 0
): SelectionPromptContext | null {
  const normalizedSelection = selectedText.trim().toLocaleLowerCase();
  if (!normalizedSelection) return null;
  const normalizedCue = text.toLocaleLowerCase();
  let selectedStart = -1;
  let searchStart = 0;

  for (let index = 0; index <= occurrenceIndex; index += 1) {
    selectedStart = normalizedCue.indexOf(normalizedSelection, searchStart);
    if (selectedStart === -1) break;
    searchStart = selectedStart + normalizedSelection.length;
  }
  if (selectedStart === -1) return null;

  const selectedEnd = selectedStart + selectedText.trim().length;
  return {
    before: text.slice(0, selectedStart),
    selected: selectedText,
    after: text.slice(selectedEnd),
  };
}

function limitCueWindow(
  cues: readonly TranscriptCue[],
  targetIndex: number,
  selectedText: string,
  occurrenceIndex: number
): SelectionPromptContext | null {
  if (cues.length === 0 || targetIndex < 0) return null;
  let startIndex = targetIndex;
  let endIndex = targetIndex;
  let wordCount = cues[targetIndex]?.text.trim().split(/\s+/).filter(Boolean).length ?? 0;

  while (wordCount < TRANSCRIPT_WORD_LIMIT && (startIndex > 0 || endIndex < cues.length - 1)) {
    const previousCue = startIndex > 0 ? cues[startIndex - 1] : undefined;
    const nextCue = endIndex < cues.length - 1 ? cues[endIndex + 1] : undefined;
    const targetTime = cues[targetIndex]?.start ?? 0;
    const takePrevious = previousCue && (!nextCue || targetTime - previousCue.start <= nextCue.start - targetTime);
    const candidate = takePrevious ? previousCue : nextCue;
    if (!candidate) break;
    const candidateWords = candidate.text.trim().split(/\s+/).filter(Boolean).length;
    if (wordCount + candidateWords > TRANSCRIPT_WORD_LIMIT) break;
    if (takePrevious) startIndex -= 1;
    else endIndex += 1;
    wordCount += candidateWords;
  }

  const targetCue = cues[targetIndex];
  if (!targetCue) return null;
  const splitTarget = splitSelectedOccurrence(targetCue.text, selectedText, occurrenceIndex);
  if (!splitTarget) return null;
  const normalize = (parts: string[]): string => parts.join(" ").replace(/\s+/g, " ").trim();

  return {
    before: normalize([
      ...cues.slice(startIndex, targetIndex).map((cue) => cue.text),
      splitTarget.before,
    ]),
    selected: selectedText,
    after: normalize([
      splitTarget.after,
      ...cues.slice(targetIndex + 1, endIndex + 1).map((cue) => cue.text),
    ]),
  };
}

export function buildTranscriptContext(
  cues: readonly TranscriptCue[],
  selectedText: string,
  currentTime: number,
  title = "",
  occurrenceIndex = 0
): SelectionPromptContext | null {
  const windowCues = cues.filter((cue) => {
    const cueEnd = cue.start + Math.max(cue.duration, 0);
    return cueEnd >= currentTime - SECONDS_BEFORE_SELECTION && cue.start <= currentTime + SECONDS_AFTER_SELECTION;
  });
  const targetIndex = selectedCueIndex(windowCues, selectedText, currentTime);
  const context = limitCueWindow(windowCues, targetIndex, selectedText, occurrenceIndex);
  if (!context) return null;
  if (title) {
    context.before = [`Video title: ${title}.`, context.before].filter(Boolean).join(" ");
  }
  return context;
}

async function transcriptForSelectedTrack(
  state: YouTubeCaptionState,
  selectedText: string
): Promise<TranscriptCue[] | null> {
  const initialResolution = resolveActiveCaptionTracks(state);
  const initialTrackNeedsFallback = initialResolution.authoritative && initialResolution.tracks[0]
    ? requiresProofToken(initialResolution.tracks[0])
    : false;

  if (!initialTrackNeedsFallback) {
    try {
      const directTranscript = await transcriptFromResolution(state, selectedText, initialResolution);
      if (directTranscript) return directTranscript;
    } catch {
      // Retry through alternate public YouTube client profiles below.
    }
  }

  if (!state.videoId) return null;
  const alternateTracks = await fetchAlternateCaptionTracks(state.videoId);
  if (alternateTracks.length === 0) return null;
  const alternateState = { ...state, captionTracks: alternateTracks };
  return transcriptFromResolution(
    alternateState,
    selectedText,
    resolveActiveCaptionTracks(alternateState)
  );
}

async function transcriptFromResolution(
  state: YouTubeCaptionState,
  selectedText: string,
  resolution: TrackResolution
): Promise<TranscriptCue[] | null> {
  if (resolution.tracks.length === 0) return null;

  if (resolution.authoritative && resolution.tracks[0]) {
    return fetchTranscript(resolution.tracks[0], state.activeTrack);
  }

  const candidates = await Promise.allSettled(
    resolution.tracks.map(async (track) => ({
      track,
      cues: await fetchTranscript(track, state.activeTrack),
    }))
  );
  const matching = candidates.flatMap((candidate) => {
    if (candidate.status !== "fulfilled") return [];
    return candidate.value.cues.some((cue) => cueMatchesSelection(cue, selectedText, state.currentTime))
      ? [candidate.value]
      : [];
  });

  return matching.length === 1 ? matching[0]?.cues ?? null : null;
}

export async function getExpandedYouTubeContext(
  selectedText: string,
  occurrenceIndex = 0
): Promise<ExpandedYouTubeContextResult> {
  const state = await requestCaptionState();
  if (!state) {
    return { ok: false, reason: "Could not read YouTube's active caption state." };
  }
  if (state.captionTracks.length === 0) {
    return { ok: false, reason: "YouTube did not expose any caption tracks for this video." };
  }
  try {
    const cues = await transcriptForSelectedTrack(state, selectedText);
    if (!cues) {
      return { ok: false, reason: "The active YouTube caption track could not be downloaded or identified." };
    }
    const context = buildTranscriptContext(
      cues,
      selectedText,
      state.currentTime,
      state.title,
      occurrenceIndex
    );
    if (!context) {
      return {
        ok: false,
        reason: "The transcript loaded, but the selected subtitle could not be matched to it.",
      };
    }
    return { ok: true, context };
  } catch (error) {
    console.warn("Could not load expanded YouTube subtitle context:", error);
    const detail = error instanceof Error && error.message ? ` ${error.message}` : "";
    return { ok: false, reason: `YouTube transcript parsing failed.${detail}` };
  }
}
