// YouTube subtitle selection fix
if (window.location.hostname.includes('youtube.com') || window.location.hostname.includes('youtu.be')) {
  // Add CSS to make subtitles selectable
  const subtitleStyle = document.createElement('style');
  subtitleStyle.innerHTML = `
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

  // Watch for dynamically added subtitle elements
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) { // Element node
          const element = node;
          if (element.classList && (
            element.classList.contains('ytp-caption-segment') ||
            element.classList.contains('caption-visual-line') ||
            element.closest('.ytp-caption-window-container')
          )) {
            element.style.userSelect = 'text';
            element.style.pointerEvents = 'auto';
            element.style.webkitUserSelect = 'text';

            // Add event listeners to prevent dragging
            element.addEventListener('mousedown', preventDrag, true);
            element.addEventListener('mousemove', preventDrag, true);
            element.addEventListener('dragstart', preventDrag, true);
          }
        }
      });
    });
  });

  // Function to prevent dragging behavior
  function preventDrag(e) {
    if (e.type === 'dragstart') {
      e.preventDefault();
      return false;
    }
    // Only prevent default for mouse events that might cause dragging
    if (e.type === 'mousedown' && e.button !== 0) {
      return; // Allow right-click
    }
    // Prevent the event from bubbling up to parent elements
    e.stopPropagation();
  }


  // Add global event handlers to subtitle containers
  function setupSubtitleEventHandlers() {
    const subtitleContainers = document.querySelectorAll('.ytp-caption-window-container, .ytp-caption-segment, .caption-visual-line');
    subtitleContainers.forEach(container => {
      container.addEventListener('mousedown', preventDrag, true);
      container.addEventListener('mousemove', preventDrag, true);
      container.addEventListener('dragstart', preventDrag, true);
      container.addEventListener('selectstart', (e) => e.stopPropagation(), true);
    });
  }

  // Initial setup
  setupSubtitleEventHandlers();

  // Start observing changes to the document body
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // Re-setup handlers when new content loads
  setInterval(setupSubtitleEventHandlers, 1000);
}
