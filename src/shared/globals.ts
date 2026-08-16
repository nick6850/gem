import type { ChatMessage, RuntimeConfig } from "./types";

export {};

declare global {
  const __BUILD_CONFIG__: RuntimeConfig;

  interface Window {
    FOLLOWUP_SYSTEM_PROMPT: string;
    buildAnalysisPrompt(
      selectedText: string,
      context: string,
      provider?: string,
      movieMode?: boolean
    ): string;
    buildConversationPrompt(conversationHistory: readonly ChatMessage[], currentQuestion: string): string;
    buildFollowupPrompt(
      originalSelection?: string,
      lastAssistantMessage?: string,
      userQuestion?: string
    ): string;
    setLLMProvider(provider: string): void;
    analyzeText(selectedText: string, context: string, isFollowUp?: boolean): Promise<string>;
    analyzeWithOpenAILLM(selectedText: string, context: string, isFollowUp?: boolean): Promise<string>;
    extractOpenAIText(data: unknown): string;
    getContextAroundSelection(): import("./types").SelectionContext;
  }

  var GEM_CONFIG: RuntimeConfig | undefined;
  var __fetchCalls: unknown[] | undefined;
  var __mockResponses: string[] | undefined;
  var __chromeMessages: unknown[] | undefined;
  var __runtimeListeners: unknown[] | undefined;
  var __copiedDiagnostics: string | undefined;
  var __offscreenDocument: unknown;
}
