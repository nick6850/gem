function isYouTubePage(): boolean {
  return window.location.hostname.includes("youtube.com") || window.location.hostname.includes("youtu.be");
}

function preventDrag(event: MouseEvent | DragEvent | Event): false | void {
  if (event.type === "dragstart") {
    event.preventDefault();
    return false;
  }

  if (event instanceof MouseEvent && event.type === "mousedown" && event.button !== 0) {
    return;
  }

  event.stopPropagation();
}

function allowNativeContextMenu(event: Event): void {
  // Keep YouTube's delegated player handler from replacing the browser menu.
  // Deliberately do not call preventDefault(): the native menu should still open.
  event.stopPropagation();
}

function setupSubtitleEventHandlers(): void {
  const subtitleContainers = document.querySelectorAll(
    ".ytp-caption-window-container, .ytp-caption-segment, .caption-visual-line"
  );

  subtitleContainers.forEach((container) => {
    container.addEventListener("mousedown", preventDrag, true);
    container.addEventListener("mousemove", preventDrag, true);
    container.addEventListener("dragstart", preventDrag, true);
    container.addEventListener("selectstart", (event) => event.stopPropagation(), true);
    container.addEventListener("contextmenu", allowNativeContextMenu, true);
  });
}

function makeNewSubtitleNodeSelectable(element: Element): void {
  if (
    !element.classList.contains("ytp-caption-segment") &&
    !element.classList.contains("caption-visual-line") &&
    !element.closest(".ytp-caption-window-container")
  ) {
    return;
  }

  const htmlElement = element as HTMLElement;
  htmlElement.style.userSelect = "text";
  htmlElement.style.pointerEvents = "auto";
  htmlElement.style.webkitUserSelect = "text";

  element.addEventListener("mousedown", preventDrag, true);
  element.addEventListener("mousemove", preventDrag, true);
  element.addEventListener("dragstart", preventDrag, true);
  element.addEventListener("contextmenu", allowNativeContextMenu, true);
}

export function initYouTubeSubtitleSelectionFixes(): void {
  if (!isYouTubePage() || !document.head || !document.body) {
    return;
  }

  const subtitleStyle = document.createElement("style");
  subtitleStyle.textContent = `
    /* Target subtitle containers and text elements */
    .ytp-caption-window-container,
    .ytp-caption-segment,
    .caption-visual-line,
    .ytp-caption-window-container * {
      user-select: text !important;
      -webkit-user-select: text !important;
      -moz-user-select: text !important;
      -ms-user-select: text !important;
      cursor: text !important;
    }

    /* Prevent dragging and other pointer events that interfere with selection */
    .ytp-caption-window-container {
      pointer-events: none !important;
    }

    /* Re-enable pointer events for text selection */
    .ytp-caption-window-container * {
      pointer-events: auto !important;
    }

    /* Specific targeting for subtitle text spans */
    .ytp-caption-segment span,
    .caption-visual-line span,
    .ytp-caption-text {
      user-select: text !important;
      pointer-events: auto !important;
      cursor: text !important;
      -webkit-user-select: text !important;
      -moz-user-select: text !important;
      -ms-user-select: text !important;
    }

    /* Prevent any dragging behavior */
    .ytp-caption-window-container,
    .ytp-caption-segment,
    .caption-visual-line {
      -webkit-user-drag: none !important;
      -moz-user-drag: none !important;
      user-drag: none !important;
      touch-action: manipulation !important;
    }

    .caption-window {
      bottom: 0% !important;
    }

    .caption-window.ytp-caption-window-rollup {
      left: 36% !important;
    }
  `;
  document.head.appendChild(subtitleStyle);

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          makeNewSubtitleNodeSelectable(node as Element);
        }
      });
    });
  });

  setupSubtitleEventHandlers();

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  window.setInterval(setupSubtitleEventHandlers, 1000);
}
