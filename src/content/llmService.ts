import type { AnalyzerClient, LLMProvider } from "../shared/types";
import { GeminiClient } from "../providers/gemini";
import { LocalLLMClient } from "../providers/local";
import { OpenAIClient, extractOpenAIText } from "../providers/openai";
import { ConversationStore } from "./conversationStore";

export { extractOpenAIText };

const FALLBACK_ORDER: Record<LLMProvider, readonly LLMProvider[]> = {
  openai: ["local", "gemini"],
  local: ["openai", "gemini"],
  gemini: ["openai", "local"],
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class LLMService {
  private readonly clients: Record<LLMProvider, AnalyzerClient>;

  constructor(private readonly conversationStore: ConversationStore) {
    this.clients = {
      openai: new OpenAIClient(),
      local: new LocalLLMClient(),
      gemini: new GeminiClient(),
    };
  }

  async analyzeText(selectedText: string, context: string, isFollowUp = false): Promise<string> {
    return this.analyzeWithFallback(
      this.conversationStore.currentProvider,
      selectedText,
      context,
      isFollowUp
    );
  }

  async analyzeWithProvider(
    provider: LLMProvider,
    selectedText: string,
    context: string,
    isFollowUp = false
  ): Promise<string> {
    const turn = this.conversationStore.startTurn({ selectedText, context, isFollowUp });
    const aiReply = await this.clients[provider].analyze({
      selectedText,
      context,
      isFollowUp,
      messages: turn.messages,
    });
    turn.commit(aiReply);
    return aiReply;
  }

  private async analyzeWithFallback(
    primaryProvider: LLMProvider,
    selectedText: string,
    context: string,
    isFollowUp: boolean
  ): Promise<string> {
    const turn = this.conversationStore.startTurn({ selectedText, context, isFollowUp });
    const providers = [primaryProvider, ...FALLBACK_ORDER[primaryProvider]];
    let primaryError: unknown = null;

    for (const provider of providers) {
      try {
        if (provider !== primaryProvider) {
          console.log(`Falling back to ${provider} LLM`);
        }

        const aiReply = await this.clients[provider].analyze({
          selectedText,
          context,
          isFollowUp,
          messages: turn.messages,
        });
        turn.commit(aiReply);
        return aiReply;
      } catch (error) {
        if (provider === primaryProvider) {
          primaryError = error;
          console.warn(`${primaryProvider} LLM failed, trying fallback:`, error);
        } else {
          console.error(`Fallback ${provider} failed:`, error);
        }
      }
    }

    throw new Error(
      `All LLM providers failed. Primary provider: ${primaryProvider}. Primary error: ${errorMessage(primaryError)}`
    );
  }
}
