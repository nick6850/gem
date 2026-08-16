import type { LLMProvider, SelectionContext } from "../shared/types";

const LIGHT_CONTEXT_WORD_LIMIT = 100;
const EXPANDED_CONTEXT_WORD_LIMIT = 250;

interface SelectionMarkers {
  start: string;
  end: string;
}

export interface ContextExtractorOptions {
  getCurrentProvider(): LLMProvider;
  getSentenceContextCount(): number;
}

function getElementText(element: Element): string {
  return "innerText" in element
    ? String((element as HTMLElement).innerText || element.textContent || "")
    : element.textContent || "";
}

function isYouTubePage(): boolean {
  return window.location.hostname.includes("youtube.com") || window.location.hostname.includes("youtu.be");
}

function getPageText(): string {
  let pageText = "";

  const pdfTextLayers = document.querySelectorAll(".textLayer");
  if (pdfTextLayers.length > 0) {
    pageText = Array.from(pdfTextLayers)
      .map((layer) => getElementText(layer))
      .join(" ")
      .trim();
  }

  if (!pageText && isYouTubePage()) {
    const contentSelectors = [
      "#primary-inner",
      "#secondary-inner",
      ".ytd-watch-flexy",
      "#description",
      ".ytp-caption-window-container",
      ".html5-video-container",
    ];

    const contentElements = contentSelectors.flatMap((selector) =>
      Array.from(document.querySelectorAll(selector))
    );

    if (contentElements.length > 0) {
      pageText = contentElements
        .map((element) => getElementText(element))
        .join(" ")
        .trim();

      const navigationPatterns = [
        /Skip navigation/gi,
        /Create\s+\d+:\d+\s*\/\s*\d+:\d+/gi,
        /\d+:\d+\s*\/\s*\d+:\d+\s*\/\s*\d+:\d+\s+left/gi,
        /Subscribe\s+\d+/gi,
        /\d+\s+views/gi,
        /\d+\s+likes/gi,
        /Share\s+Download\s+Clip\s+Save/gi,
        /Comments\s+\d+/gi,
        /Sort by/gi,
        /Top comments/gi,
        /Newest first/gi,
      ];

      for (const pattern of navigationPatterns) {
        pageText = pageText.replace(pattern, "");
      }

      pageText = pageText.replace(/\s+/g, " ").trim();
    }
  }

  if (!pageText && document.body) {
    pageText = document.body.innerText.trim();
  }

  if (!pageText) {
    pageText = (document.documentElement.textContent || "").trim();
  }

  return pageText;
}

function closestFromNode(node: Node, selector: string): Element | null {
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  return element?.closest(selector) ?? null;
}

function getSelectedTextFromRange(range: Range): string {
  const contents = range.cloneContents();
  let text = "";

  function extractText(node: Node): void {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent || "";
      return;
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      if (text && !text.endsWith(" ")) {
        text += " ";
      }

      for (const child of node.childNodes) {
        extractText(child);
      }
    }
  }

  for (const child of contents.childNodes) {
    extractText(child);
  }

  return text.replace(/\s+/g, " ").trim();
}

function isSubtitleSelection(range: Range): boolean {
  return (
    isYouTubePage() &&
    Boolean(
      closestFromNode(range.commonAncestorContainer, ".ytp-caption-window-container") ||
        closestFromNode(range.startContainer, ".ytp-caption-window-container") ||
        closestFromNode(range.endContainer, ".ytp-caption-window-container")
    )
  );
}

function countOccurrences(text: string, selectedText: string): number {
  const normalizedText = text.toLocaleLowerCase();
  const normalizedSelection = selectedText.trim().toLocaleLowerCase();
  if (!normalizedSelection) return 0;
  let count = 0;
  let searchStart = 0;
  while (searchStart < normalizedText.length) {
    const matchIndex = normalizedText.indexOf(normalizedSelection, searchStart);
    if (matchIndex === -1) break;
    count += 1;
    searchStart = matchIndex + normalizedSelection.length;
  }
  return count;
}

function selectionOccurrenceWithinSubtitle(range: Range, selectedText: string): number {
  const captionElement = closestFromNode(
    range.startContainer,
    ".ytp-caption-segment, .ytp-caption-text"
  );
  if (!captionElement || !captionElement.contains(range.startContainer)) return 0;

  try {
    const prefixRange = document.createRange();
    prefixRange.selectNodeContents(captionElement);
    prefixRange.setEnd(range.startContainer, range.startOffset);
    return countOccurrences(prefixRange.toString(), selectedText);
  } catch {
    return 0;
  }
}

function getSubtitleText(): string {
  const subtitleContainer = document.querySelector(".ytp-caption-window-container");
  if (!subtitleContainer) {
    return "";
  }

  return getElementText(subtitleContainer)
    .replace(/Skip navigation/gi, "")
    .replace(/Create\s+\d+:\d+/gi, "")
    .trim();
}

function previousSentenceStart(text: string, currentStart: number): number {
  let cursor = currentStart - 1;
  while (cursor >= 0 && /\s/.test(text[cursor] ?? "")) cursor -= 1;
  if (cursor >= 0 && /[.!?]/.test(text[cursor] ?? "")) cursor -= 1;

  for (let index = cursor; index >= 0; index -= 1) {
    if (/[.!?]/.test(text[index] ?? "")) {
      return index + 1;
    }
  }

  return 0;
}

function nextSentenceEnd(text: string, currentEnd: number): number {
  for (let index = currentEnd; index < text.length; index += 1) {
    if (/[.!?]/.test(text[index] ?? "")) {
      return index + 1;
    }
  }

  return text.length;
}

function words(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

function createSelectionMarkers(pageText: string): SelectionMarkers {
  let attempt = 0;
  while (true) {
    const id = typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}-${attempt}`;
    const markers = {
      start: `__GEM_SELECTION_START_${id}__`,
      end: `__GEM_SELECTION_END_${id}__`,
    };
    if (!pageText.includes(markers.start) && !pageText.includes(markers.end)) return markers;
    attempt += 1;
  }
}

function limitMarkedContext(
  markedContext: string,
  wordLimit: number,
  markers: SelectionMarkers
): {
  contextBefore: string;
  contextAfter: string;
  fullContext: string;
} {
  const startMarkerIndex = markedContext.indexOf(markers.start);
  const endMarkerIndex = markedContext.indexOf(markers.end);
  if (startMarkerIndex === -1 || endMarkerIndex === -1) {
    const limitedWords = words(markedContext).slice(0, wordLimit);
    const fullContext = limitedWords.join(" ");
    return { contextBefore: "", contextAfter: "", fullContext };
  }

  const beforeText = markedContext.slice(0, startMarkerIndex).trim();
  const selectedText = markedContext
    .slice(startMarkerIndex + markers.start.length, endMarkerIndex)
    .trim();
  const afterText = markedContext.slice(endMarkerIndex + markers.end.length).trim();
  const beforeWords = words(beforeText);
  const selectedWords = words(selectedText);
  const afterWords = words(afterText);

  if (beforeWords.length + selectedWords.length + afterWords.length <= wordLimit) {
    return {
      contextBefore: beforeText,
      contextAfter: afterText,
      fullContext: [beforeText, selectedText, afterText].filter(Boolean).join(" "),
    };
  }

  const surroundingBudget = Math.max(0, wordLimit - selectedWords.length);
  let beforeBudget = Math.ceil(surroundingBudget / 2);
  let afterBudget = Math.floor(surroundingBudget / 2);

  if (beforeWords.length < beforeBudget) {
    afterBudget += beforeBudget - beforeWords.length;
    beforeBudget = beforeWords.length;
  }
  if (afterWords.length < afterBudget) {
    beforeBudget = Math.min(beforeWords.length, beforeBudget + afterBudget - afterWords.length);
    afterBudget = afterWords.length;
  }

  const contextBefore = beforeWords.slice(-beforeBudget).join(" ");
  const contextAfter = afterWords.slice(0, afterBudget).join(" ");
  const fullContext = [contextBefore, selectedText, contextAfter].filter(Boolean).join(" ");
  return { contextBefore, contextAfter, fullContext };
}

function tryExtractSentenceContext(
  pageText: string,
  selectedText: string,
  sentenceContextCount: number,
  markers: SelectionMarkers
): SelectionContext | null {
  const startMarkerIndex = pageText.indexOf(markers.start);
  const endMarkerIndex = pageText.indexOf(markers.end);

  if (startMarkerIndex === -1 || endMarkerIndex === -1) {
    return null;
  }

  let currentSentenceStart = 0;
  for (let i = startMarkerIndex - 1; i >= 0; i--) {
    const char = pageText[i];
    if (char === "." || char === "!" || char === "?") {
      currentSentenceStart = i + 1;
      break;
    }
  }

  let currentSentenceEnd = pageText.length;
  for (let i = endMarkerIndex; i < pageText.length; i++) {
    const char = pageText[i];
    if (char === "." || char === "!" || char === "?") {
      currentSentenceEnd = i + 1;
      break;
    }
  }

  let contextStart = currentSentenceStart;
  let contextEnd = currentSentenceEnd;
  const surroundingSentenceCount = Math.max(0, Math.floor((sentenceContextCount - 1) / 2));
  for (let index = 0; index < surroundingSentenceCount; index += 1) {
    contextStart = previousSentenceStart(pageText, contextStart);
    contextEnd = nextSentenceEnd(pageText, contextEnd);
  }

  const markedContext = pageText.substring(contextStart, contextEnd).trim();
  const limitedContext = limitMarkedContext(
    markedContext,
    sentenceContextCount === 1 ? LIGHT_CONTEXT_WORD_LIMIT : EXPANDED_CONTEXT_WORD_LIMIT,
    markers
  );

  return {
    selectedText,
    contextBefore: limitedContext.contextBefore,
    contextAfter: limitedContext.contextAfter,
    fullContext: limitedContext.fullContext,
  };
}

function extractWordBasedContext(
  pageText: string,
  selectedText: string,
  provider: LLMProvider,
  sentenceContextCount: number,
  markers: SelectionMarkers
): SelectionContext {
  const pageTextWords = pageText.split(/\s+/);
  const startMarkerIndex = pageTextWords.indexOf(markers.start);
  const finishMarkerIndex = pageTextWords.indexOf(markers.end);

  if (startMarkerIndex === -1 || finishMarkerIndex === -1 || finishMarkerIndex < startMarkerIndex) {
    return {
      selectedText,
      contextBefore: "",
      contextAfter: "",
      fullContext: pageText || selectedText,
    };
  }

  const windowSize = sentenceContextCount > 1 ? 125 : provider === "local" ? 10 : 50;
  const start = Math.max(startMarkerIndex - windowSize, 0);
  const end = Math.min(finishMarkerIndex + windowSize, pageTextWords.length);
  const contextBefore = pageTextWords.slice(start, startMarkerIndex).join(" ");
  const contextAfter = pageTextWords.slice(finishMarkerIndex + 1, end).join(" ");
  const fullContext = [contextBefore, selectedText, contextAfter].filter(Boolean).join(" ");

  return {
    selectedText,
    contextBefore,
    contextAfter,
    fullContext,
  };
}

export function createContextExtractor(options: ContextExtractorOptions): () => SelectionContext {
  return function getContextAroundSelection(): SelectionContext {
    let pageText = getPageText();
    const selection = window.getSelection();

    if (!selection || selection.rangeCount === 0) {
      return {
        selectedText: "",
        contextBefore: "",
        contextAfter: "",
        fullContext: pageText,
      };
    }

    const range = selection.getRangeAt(0);
    const selectedText = getSelectedTextFromRange(range);

    if (!selectedText) {
      return {
        selectedText: "",
        contextBefore: "",
        contextAfter: "",
        fullContext: pageText,
      };
    }

    const subtitleSelection = isSubtitleSelection(range);
    const selectionOccurrenceIndex = subtitleSelection
      ? selectionOccurrenceWithinSubtitle(range, selectedText)
      : 0;
    if (subtitleSelection) {
      pageText = getSubtitleText();
    }

    const markers = createSelectionMarkers(pageText);
    const markerStart = document.createElement("span");
    markerStart.textContent = ` ${markers.start} `;
    const markerEnd = document.createElement("span");
    markerEnd.textContent = ` ${markers.end} `;

    try {
      const startRange = range.cloneRange();
      const endRange = range.cloneRange();
      startRange.collapse(true);
      startRange.insertNode(markerStart);
      endRange.collapse(false);
      endRange.insertNode(markerEnd);

      if (!subtitleSelection && document.body) {
        pageText = document.body.innerText.trim();
      } else if (subtitleSelection) {
        pageText = getSubtitleText();
      }
    } finally {
      markerStart.remove();
      markerEnd.remove();
    }

    const sentenceResult = tryExtractSentenceContext(
      pageText,
      selectedText,
      options.getSentenceContextCount(),
      markers
    );
    if (sentenceResult) {
      return {
        ...sentenceResult,
        source: subtitleSelection ? "youtube-subtitle" : "document",
        ...(subtitleSelection ? { selectionOccurrenceIndex } : {}),
      };
    }

    return {
      ...extractWordBasedContext(
        pageText,
        selectedText,
        options.getCurrentProvider(),
        options.getSentenceContextCount(),
        markers
      ),
      source: subtitleSelection ? "youtube-subtitle" : "document",
      ...(subtitleSelection ? { selectionOccurrenceIndex } : {}),
    };
  };
}
