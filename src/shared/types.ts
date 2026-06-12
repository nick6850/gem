export type LLMProvider = "openai" | "local" | "gemini";

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface SelectionContext {
  selectedText: string;
  contextBefore: string;
  contextAfter: string;
  fullContext: string;
}

export interface QuickPrompt {
  label: string;
  userMessage: string;
  aiPrompt: string;
  errorContext: string;
}

export interface OpenAIConfig {
  apiKey?: string | undefined;
  model?: string | undefined;
  reasoningEffort?: string | undefined;
}

export interface GeminiConfig {
  apiKey?: string | undefined;
  model?: string | undefined;
}

export interface LocalLLMConfig {
  endpoint?: string | undefined;
  model?: string | undefined;
}

export interface RuntimeConfig {
  defaultProvider?: LLMProvider | undefined;
  openai?: OpenAIConfig | undefined;
  gemini?: GeminiConfig | undefined;
  local?: LocalLLMConfig | undefined;
}

export interface AnalyzeRequest {
  selectedText: string;
  context: string;
  isFollowUp: boolean;
  messages: readonly ChatMessage[];
}

export interface AnalyzerClient {
  analyze(request: AnalyzeRequest): Promise<string>;
}

export interface RuntimeApi {
  analyzeText(selectedText: string, context: string, isFollowUp?: boolean): Promise<string>;
}
