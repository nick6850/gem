function getContextAroundSelection() {
  // Get the trimmed inner text of the entire document body
  // For PDFs, try multiple approaches to get text
  let pageText = '';
  
  // Try PDF.js text layer first (most common PDF viewer)
  const pdfTextLayers = document.querySelectorAll('.textLayer');
  if (pdfTextLayers.length > 0) {
    pageText = Array.from(pdfTextLayers)
      .map(layer => layer.innerText || layer.textContent)
      .join(' ')
      .trim();
  }
  
  // Special handling for YouTube to avoid navigation elements
  if (!pageText && (window.location.hostname.includes('youtube.com') || window.location.hostname.includes('youtu.be'))) {
    // Try to get text from main content areas, avoiding navigation
    const contentSelectors = [
      '#primary-inner', // Main content area
      '#secondary-inner', // Sidebar content
      '.ytd-watch-flexy', // Watch page content
      '#description', // Video description
      '.ytp-caption-window-container', // Subtitle container
      '.html5-video-container' // Video container area
    ];
    
    const contentElements = [];
    contentSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => contentElements.push(el));
    });
    
    if (contentElements.length > 0) {
      pageText = contentElements
        .map(el => el.innerText || el.textContent)
        .join(' ')
        .trim();
      
      // Filter out common YouTube navigation elements
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
        /Newest first/gi
      ];
      
      navigationPatterns.forEach(pattern => {
        pageText = pageText.replace(pattern, '');
      });
      
      // Clean up extra whitespace
      pageText = pageText.replace(/\s+/g, ' ').trim();
    }
  }
  
  // Fallback to document body for regular pages and other PDF viewers
  if (!pageText && document.body) {
    pageText = document.body.innerText.trim();
  }
  
  // Final fallback to document text content
  if (!pageText) {
    pageText = document.documentElement.textContent.trim();
  }

  // Get the current text selection
  const selection = window.getSelection();

  // Check if there is at least one range in the selection
  if (selection.rangeCount) {
    // Get the first range of the selection
    const range = selection.getRangeAt(0);
    // Better text extraction that adds spaces between different elements
    const selectedText = (() => {
      const contents = range.cloneContents();
      let text = '';
      
      function extractText(node) {
        if (node.nodeType === Node.TEXT_NODE) {
          text += node.textContent;
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          // Add space before each element (except first)
          if (text && !text.endsWith(' ')) {
            text += ' ';
          }
          for (let child of node.childNodes) {
            extractText(child);
          }
        }
      }
      
      for (let child of contents.childNodes) {
        extractText(child);
      }
      
      // Clean up whitespace but preserve single spaces between words
      return text.replace(/\s+/g, ' ').trim();
    })();

    // Proceed only if there is selected text
    if (selectedText) {
      // For YouTube subtitle selections, try to get context only from subtitle area
      const isYouTube = window.location.hostname.includes('youtube.com') || window.location.hostname.includes('youtu.be');
      const isSubtitleSelection = isYouTube && (
        range.commonAncestorContainer.closest?.('.ytp-caption-window-container') ||
        range.startContainer.parentElement?.closest?.('.ytp-caption-window-container') ||
        range.endContainer.parentElement?.closest?.('.ytp-caption-window-container')
      );

      if (isSubtitleSelection) {
        // For subtitle selections, use minimal context - just the subtitle text
        const subtitleContainer = document.querySelector('.ytp-caption-window-container');
        if (subtitleContainer) {
          pageText = subtitleContainer.innerText || subtitleContainer.textContent || '';
          // Clean up any remaining navigation elements
          pageText = pageText.replace(/Skip navigation/gi, '').replace(/Create\s+\d+:\d+/gi, '').trim();
        }
      }

      // Create start and end marker elements with essential spaces
      const markerStart = document.createElement("span");
      markerStart.textContent = " <<<SELECTED>>> ";

      const markerEnd = document.createElement("span");
      markerEnd.textContent = " <<</SELECTED>>> ";

      // Clone the range to avoid modifying the original selection
      const startRange = range.cloneRange();
      const endRange = range.cloneRange();

      // Insert the start marker at the beginning of the selection
      startRange.collapse(true); // Collapse to the start of the range
      startRange.insertNode(markerStart);

      // Insert the end marker at the end of the selection
      endRange.collapse(false); // Collapse to the end of the range
      endRange.insertNode(markerEnd);

      // Update the pageText to include the markers, but only if not already set for subtitles
      if (!isSubtitleSelection) {
        pageText = document.body.innerText.trim();
      } else {
        // For subtitle selections, re-get the text with markers
        const subtitleContainer = document.querySelector('.ytp-caption-window-container');
        if (subtitleContainer) {
          pageText = subtitleContainer.innerText || subtitleContainer.textContent || '';
        }
      }

      // Remove the markers from the DOM to clean up
      markerStart.remove();
      markerEnd.remove();

      // Try sentence-based context first
      const sentenceResult = tryExtractSentenceContext(pageText, selectedText);
      if (sentenceResult) {
        return sentenceResult;
      }

      // Fallback to word-based context (original method)
      return extractWordBasedContext(pageText, selectedText);
    }
  }

  // If there is no selection, return object with full page text
  return {
    selectedText: "",
    contextBefore: "",
    contextAfter: "",
    fullContext: pageText
  };
}

// Helper function to try extracting sentence-based context
function tryExtractSentenceContext(pageText, selectedText) {
  // Find the position of the selected text markers
  const startMarkerIndex = pageText.indexOf("<<<SELECTED>>>");
  const endMarkerIndex = pageText.indexOf("<<</SELECTED>>>");
  
  if (startMarkerIndex === -1 || endMarkerIndex === -1) {
    return null;
  }

  // Find the start of the current sentence (sentence containing the selection)
  let currentSentenceStart = 0;
  for (let i = startMarkerIndex - 1; i >= 0; i--) {
    const char = pageText[i];
    if (char === '.' || char === '!' || char === '?') {
      currentSentenceStart = i + 1;
      break;
    }
  }

  // Find the end of the current sentence
  let currentSentenceEnd = pageText.length;
  for (let i = endMarkerIndex; i < pageText.length; i++) {
    const char = pageText[i];
    if (char === '.' || char === '!' || char === '?') {
      currentSentenceEnd = i + 1;
      break;
    }
  }

  // Check if we need more sentences due to short context
  let actualSentenceCount = sentenceContextCount;
  if (sentenceContextCount === 1) {
    // For single sentence, check if it's too short and add one more before if needed
    const currentSentenceText = pageText.substring(currentSentenceStart, currentSentenceEnd).trim();
    const cleanCurrentSentence = currentSentenceText.replace(/<<<SELECTED>>>|<<<\/SELECTED>>>/g, '');
    const wordCount = cleanCurrentSentence.trim().split(/\s+/).length;
    
    if (wordCount <= 3) {
      actualSentenceCount = 2;
    }
  }

  // Find the start position for the desired number of sentences
  let contextStart = currentSentenceStart;
  
  if (actualSentenceCount > 1 && currentSentenceStart > 0) {
    // We need more than just the current sentence, find previous sentences
    let sentencesFound = 1; // We already have the current sentence
    let searchPosition = currentSentenceStart;
    
    while (sentencesFound < actualSentenceCount && searchPosition > 0) {
      // Look backwards to find the end of the previous sentence
      let foundSentenceEnd = false;
      for (let i = searchPosition - 1; i >= 0; i--) {
        const char = pageText[i];
        if (char === '.' || char === '!' || char === '?') {
          // Found end of a sentence, now find its start
          for (let j = i - 1; j >= 0; j--) {
            const prevChar = pageText[j];
            if (prevChar === '.' || prevChar === '!' || prevChar === '?') {
              // Found start of this sentence
              searchPosition = j + 1;
              sentencesFound++;
              foundSentenceEnd = true;
              break;
            }
          }
          if (!foundSentenceEnd) {
            // No previous sentence start found, use beginning of text
            searchPosition = 0;
            sentencesFound++;
            foundSentenceEnd = true;
          }
          break;
        }
      }
      if (!foundSentenceEnd) {
        // No more sentences found, stop
        break;
      }
    }
    
    contextStart = searchPosition;
  }

  // Extract context with the actual number of sentences
  const fullContext = pageText.substring(contextStart, currentSentenceEnd).trim();

  // Clean up markers from the context
  const cleanFullContext = fullContext.replace(/<<<SELECTED>>>|<<<\/SELECTED>>>/g, '');

  return {
    selectedText: selectedText,
    contextBefore: '',
    contextAfter: '',
    fullContext: cleanFullContext
  };
}

// Helper function for word-based context (original method)
function extractWordBasedContext(pageText, selectedText) {
  // Split the page text into an array of words
  const pageTextWords = pageText.split(/\s+/);

  // Find the indices of the start and end markers
  const startMarkerIndex = pageTextWords.indexOf("<<<SELECTED>>>");
  const finishMarkerIndex = pageTextWords.indexOf("<<</SELECTED>>>");

  // Define the number of words to include before and after the selection
  const windowSize = currentLLMProvider === 'local' ? 10 : 150;

  // Calculate the start and end indices for slicing, ensuring they stay within bounds
  const start = Math.max(startMarkerIndex - windowSize, 0);
  const end = Math.min(
    finishMarkerIndex + windowSize,
    pageTextWords.length
  );

  // Extract context before, selected text, and context after
  const contextBefore = pageTextWords.slice(start, startMarkerIndex).join(" ");
  const contextAfter = pageTextWords.slice(finishMarkerIndex + 1, end).join(" ");

  // Extract the final text window around the selection
  const fullContext = pageTextWords.slice(start, end).join(" ");

  // Return object with separate components
  return {
    selectedText: selectedText,
    contextBefore: contextBefore,
    contextAfter: contextAfter,
    fullContext: fullContext
  };
}
