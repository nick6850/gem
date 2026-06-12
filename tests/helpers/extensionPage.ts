import { expect, type Page } from "@playwright/test";

interface LoadExtensionPageOptions {
  responses?: string[];
}

export async function loadExtensionPage(
  page: Page,
  { responses = ["A clear mocked definition."] }: LoadExtensionPageOptions = {}
): Promise<void> {
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
    globalThis.fetch = (async (url: RequestInfo | URL, options: RequestInit = {}) => {
      const body = options.body ? JSON.parse(String(options.body)) : null;
      globalThis.__fetchCalls?.push({ url: String(url), options: { ...options, body } });
      const output = globalThis.__mockResponses?.shift() || "A clear mocked definition.";

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
    }) as typeof fetch;

    (globalThis as unknown as { chrome: unknown }).chrome = {
      runtime: {
        sendMessage(message: unknown, callback?: (response: unknown) => void) {
          globalThis.__chromeMessages ||= [];
          globalThis.__chromeMessages.push(message);
          callback?.({ success: true });
        },
        onMessage: {
          addListener(listener: unknown) {
            globalThis.__runtimeListeners ||= [];
            globalThis.__runtimeListeners.push(listener);
          },
        },
      },
      offscreen: {
        async hasDocument() {
          return false;
        },
        async createDocument(args: unknown) {
          globalThis.__offscreenDocument = args;
        },
      },
    };
  }, responses);

  await page.goto("/tests/fixtures/page.html");
  await expect(page.locator("#my-ai-helper-host")).toHaveCount(1);
}

export async function selectText(page: Page, selector: string, text: string): Promise<void> {
  await page.evaluate(({ selector, text }) => {
    const element = document.querySelector(selector);
    if (!element) {
      throw new Error(`Selector not found: ${selector}`);
    }

    const node = [...element.childNodes].find(
      (child) => child.nodeType === Node.TEXT_NODE && child.textContent?.includes(text)
    );
    if (!node?.textContent) {
      throw new Error(`Text not found: ${text}`);
    }

    const start = node.textContent.indexOf(text);
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, start + text.length);
    const selection = window.getSelection();
    if (!selection) {
      throw new Error("No window selection available");
    }

    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  }, { selector, text });
}

export async function getExtensionState(page: Page): Promise<{
  popup: {
    display: string;
    visibility: string;
    left: string;
    top: string;
    width: number;
    height: number;
    scrollWidth: number;
    clientWidth: number;
    scrollHeight: number;
    clientHeight: number;
    overflowX: string;
    overflowY: string;
    maxHeight: string;
    boxSizing: string;
    borderRadius: string;
  };
  overlayDisplay: string;
  input: {
    placeholder: string;
    height: string;
    fontSize: string;
  };
  notification: {
    display: string;
    text: string | null;
    borderColor: string;
  };
  quickPrompts: Array<string | null>;
  messages: Array<{
    text: string;
    className: string;
    width: number;
    height: number;
  }>;
  bodyOverflowingX: boolean;
}> {
  return page.evaluate(() => {
    const host = document.querySelector("#my-ai-helper-host");
    if (!host?.shadowRoot) {
      throw new Error("Extension shadow host not found");
    }

    const root = host.shadowRoot;
    const popup = root.querySelector(".popup");
    const overlay = root.querySelector(".popup-overlay");
    const chat = root.querySelector(".chat-container");
    const input = root.querySelector("input");
    const notification = root.querySelector(".provider-notification");
    if (
      !(popup instanceof HTMLElement) ||
      !(overlay instanceof HTMLElement) ||
      !(chat instanceof HTMLElement) ||
      !(input instanceof HTMLInputElement) ||
      !(notification instanceof HTMLElement)
    ) {
      throw new Error("Extension UI is incomplete");
    }

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

export async function triggerAnalyzeShortcut(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", {
      key: "b",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    }));
  });
}
