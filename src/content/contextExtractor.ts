import type { LLMProvider, SelectionContext } from "../shared/types";

const SELECTED_START_MARKER = "<<<SELECTED>>>";
const SELECTED_END_MARKER = "<<</SELECTED>>>";

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

function markerPattern(): RegExp {
  return /<<<SELECTED>>>|<<<\/SELECTED>>>/g;
}

function tryExtractSentenceContext(
  pageText: string,
  selectedText: string,
  sentenceContextCount: number
): SelectionContext | null {
  const startMarkerIndex = pageText.indexOf(SELECTED_START_MARKER);
  const endMarkerIndex = pageText.indexOf(SELECTED_END_MARKER);

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

  let actualSentenceCount = sentenceContextCount;
  if (sentenceContextCount === 1) {
    const currentSentenceText = pageText.substring(currentSentenceStart, currentSentenceEnd).trim();
    const cleanCurrentSentence = currentSentenceText.replace(markerPattern(), "");
    const wordCount = cleanCurrentSentence.trim().split(/\s+/).length;

    if (wordCount <= 3) {
      actualSentenceCount = 2;
    }
  }

  let contextStart = currentSentenceStart;

  if (actualSentenceCount > 1 && currentSentenceStart > 0) {
    let sentencesFound = 1;
    let searchPosition = currentSentenceStart;

    while (sentencesFound < actualSentenceCount && searchPosition > 0) {
      let foundSentenceEnd = false;
      for (let i = searchPosition - 1; i >= 0; i--) {
        const char = pageText[i];
        if (char === "." || char === "!" || char === "?") {
          for (let j = i - 1; j >= 0; j--) {
            const prevChar = pageText[j];
            if (prevChar === "." || prevChar === "!" || prevChar === "?") {
              searchPosition = j + 1;
              sentencesFound++;
              foundSentenceEnd = true;
              break;
            }
          }
          if (!foundSentenceEnd) {
            searchPosition = 0;
            sentencesFound++;
            foundSentenceEnd = true;
          }
          break;
        }
      }
      if (!foundSentenceEnd) {
        break;
      }
    }

    contextStart = searchPosition;
  }

  const fullContext = pageText.substring(contextStart, currentSentenceEnd).trim();
  const cleanFullContext = fullContext.replace(markerPattern(), "");

  return {
    selectedText,
    contextBefore: "",
    contextAfter: "",
    fullContext: cleanFullContext,
  };
}

function extractWordBasedContext(
  pageText: string,
  selectedText: string,
  provider: LLMProvider
): SelectionContext {
  const pageTextWords = pageText.split(/\s+/);
  const startMarkerIndex = pageTextWords.indexOf(SELECTED_START_MARKER);
  const finishMarkerIndex = pageTextWords.indexOf(SELECTED_END_MARKER);

  if (startMarkerIndex === -1 || finishMarkerIndex === -1 || finishMarkerIndex < startMarkerIndex) {
    return {
      selectedText,
      contextBefore: "",
      contextAfter: "",
      fullContext: pageText || selectedText,
    };
  }

  const windowSize = provider === "local" ? 10 : 150;
  const start = Math.max(startMarkerIndex - windowSize, 0);
  const end = Math.min(finishMarkerIndex + windowSize, pageTextWords.length);
  const contextBefore = pageTextWords.slice(start, startMarkerIndex).join(" ");
  const contextAfter = pageTextWords.slice(finishMarkerIndex + 1, end).join(" ");
  const fullContext = pageTextWords.slice(start, end).join(" ");

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
    if (subtitleSelection) {
      pageText = getSubtitleText();
    }

    const markerStart = document.createElement("span");
    markerStart.textContent = ` ${SELECTED_START_MARKER} `;
    const markerEnd = document.createElement("span");
    markerEnd.textContent = ` ${SELECTED_END_MARKER} `;

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
      options.getSentenceContextCount()
    );
    if (sentenceResult) {
      return sentenceResult;
    }

    return extractWordBasedContext(pageText, selectedText, options.getCurrentProvider());
  };
}
