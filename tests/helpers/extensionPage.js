import { expect } from "@playwright/test";

export async function loadExtensionPage(page, { responses = ["A clear mocked definition."] } = {}) {
  await page.addInitScript((mockResponses) => {
    globalThis.GEM_CONFIG = {
      defaultProvider: "openai",
      openai: {
        apiKey: "test-openai-key",
        model: "test-openai-model",
        reasoningEffort: "low",
      },
    };

    globalThis.__fetchCalls = [];
    globalThis.__mockResponses = [...mockResponses];
    globalThis.fetch = async (url, options = {}) => {
      const body = options.body ? JSON.parse(options.body) : null;
      globalThis.__fetchCalls.push({ url: String(url), options: { ...options, body } });
      const output = globalThis.__mockResponses.shift() || "A clear mocked definition.";

      return {
        ok: true,
        status: 200,
        async json() {
          return { output_text: output };
        },
        async text() {
          return JSON.stringify({ output_text: output });
        },
      };
    };

    globalThis.chrome = {
      runtime: {
        sendMessage(message, callback) {
          globalThis.__chromeMessages ||= [];
          globalThis.__chromeMessages.push(message);
          callback?.({ success: true });
        },
        onMessage: {
          addListener(listener) {
            globalThis.__runtimeListeners ||= [];
            globalThis.__runtimeListeners.push(listener);
          },
        },
      },
      offscreen: {
        async hasDocument() {
          return false;
        },
        async createDocument(args) {
          globalThis.__offscreenDocument = args;
        },
      },
    };
  }, responses);

  await page.goto("/tests/fixtures/page.html");
  await expect(page.locator("#my-ai-helper-host")).toHaveCount(1);
}

export async function selectText(page, selector, text) {
  await page.evaluate(({ selector, text }) => {
    const element = document.querySelector(selector);
    const node = [...element.childNodes].find((child) => child.nodeType === Node.TEXT_NODE && child.textContent.includes(text));
    const start = node.textContent.indexOf(text);
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, start + text.length);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  }, { selector, text });
}

export async function getExtensionState(page) {
  return page.evaluate(() => {
    const host = document.querySelector("#my-ai-helper-host");
    const root = host.shadowRoot;
    const popup = root.querySelector(".popup");
    const overlay = root.querySelector(".popup-overlay");
    const chat = root.querySelector(".chat-container");
    const input = root.querySelector("input");
    const notification = root.querySelector(".provider-notification");
    const buttons = [...root.querySelectorAll("button")];

    const rect = popup.getBoundingClientRect();
    const popupStyle = getComputedStyle(popup);
    const inputStyle = getComputedStyle(input);

    return {
      popup: {
        display: popup.style.display,
        visibility: popup.style.visibility,
        left: popup.style.left,
        top: popup.style.top,
        width: rect.width,
        height: rect.height,
        scrollWidth: popup.scrollWidth,
        clientWidth: popup.clientWidth,
        scrollHeight: popup.scrollHeight,
        clientHeight: popup.clientHeight,
        overflowX: popupStyle.overflowX,
        overflowY: popupStyle.overflowY,
        maxHeight: popupStyle.maxHeight,
        boxSizing: popupStyle.boxSizing,
        borderRadius: popupStyle.borderRadius,
      },
      overlayDisplay: overlay.style.display,
      input: {
        placeholder: input.placeholder,
        height: inputStyle.height,
        fontSize: inputStyle.fontSize,
      },
      notification: {
        display: notification.style.display,
        text: notification.textContent,
        borderColor: notification.style.borderColor,
      },
      quickPrompts: buttons.map((button) => button.textContent),
      messages: [...chat.querySelectorAll(".message")].map((message) => ({
        text: message.textContent.trim(),
        className: message.className,
        width: message.getBoundingClientRect().width,
        height: message.getBoundingClientRect().height,
      })),
      bodyOverflowingX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
}

export async function triggerAnalyzeShortcut(page) {
  await page.evaluate(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", {
      key: "b",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    }));
  });
}
