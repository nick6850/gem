import { getDefaultProvider } from "../shared/config";
import type { ChatMessage, LLMProvider } from "../shared/types";
import { buildAnalysisPrompt, FOLLOWUP_SYSTEM_PROMPT } from "./prompts";

export interface PendingConversationTurn {
  messages: readonly ChatMessage[];
  commit(assistantReply: string): void;
}

export interface ConversationTurnInput {
  selectedText: string;
  context: string;
  isFollowUp: boolean;
}

export class ConversationStore {
  private history: ChatMessage[] = [];
  private provider: LLMProvider = getDefaultProvider();
  private movieMode = false;
  private sentenceContextCount = 1;

  get currentProvider(): LLMProvider {
    return this.provider;
  }

  get isMovieModeEnabled(): boolean {
    return this.movieMode;
  }

  get currentSentenceContextCount(): number {
    return this.sentenceContextCount;
  }

  setProvider(provider: LLMProvider): void {
    this.provider = provider;
  }

  toggleMovieMode(): boolean {
    this.movieMode = !this.movieMode;
    return this.movieMode;
  }

  reset(): void {
    this.history = [];
  }

  snapshot(): ChatMessage[] {
    return this.history.map((msg) => ({ ...msg }));
  }

  toPlainConversationMessages({ includeSystem = true } = {}): ChatMessage[] {
    return this.history
      .filter((msg) => includeSystem || msg.role === "user" || msg.role === "assistant")
      .map((msg) => ({ role: msg.role, content: msg.content }));
  }

  startTurn(input: ConversationTurnInput): PendingConversationTurn {
    this.ensureSelectedText(input.selectedText, input.isFollowUp);

    const messages = input.isFollowUp
      ? [...this.history, { role: "user" as const, content: input.selectedText }]
      : [
          {
            role: "system" as const,
            content: FOLLOWUP_SYSTEM_PROMPT,
          },
          {
            role: "user" as const,
            content: buildAnalysisPrompt(
              input.selectedText,
              input.context,
              this.provider,
              this.movieMode
            ),
          },
        ];

    return {
      messages,
      commit: (assistantReply: string) => {
        this.history = [...messages, { role: "assistant", content: assistantReply }];
      },
    };
  }

  private ensureSelectedText(selectedText: string, isFollowUp: boolean): void {
    if (!selectedText.trim() && !isFollowUp) {
      throw new Error("Empty selected text provided");
    }
  }
}
