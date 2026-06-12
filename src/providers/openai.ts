import { requireOpenAIConfig } from "../shared/config";
import type { AnalyzeRequest, AnalyzerClient, ChatMessage } from "../shared/types";
import { readErrorBody, isRecord } from "./guards";

const API_ENDPOINT = "https://api.openai.com/v1/responses";

function isConversationRole(role: ChatMessage["role"]): role is "user" | "assistant" {
  return role === "user" || role === "assistant";
}

export function extractOpenAIText(data: unknown): string {
  if (isRecord(data) && typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  if (!isRecord(data) || !Array.isArray(data.output)) {
    return "";
  }

  for (const item of data.output) {
    if (!isRecord(item) || item.type !== "message" || !Array.isArray(item.content)) {
      continue;
    }

    for (const part of item.content) {
      if (
        isRecord(part) &&
        (part.type === "output_text" || part.type === "text") &&
        typeof part.text === "string" &&
        part.text.trim()
      ) {
        return part.text.trim();
      }
    }
  }

  return "";
}

export class OpenAIClient implements AnalyzerClient {
  async analyze(request: AnalyzeRequest): Promise<string> {
    const { apiKey, model, reasoningEffort } = requireOpenAIConfig();
    const input = request.messages
      .filter((msg) => isConversationRole(msg.role))
      .map((msg) => ({ role: msg.role, content: msg.content }));

    const requestBody = {
      model,
      instructions:
        request.messages.find((msg) => msg.role === "system")?.content ??
        "You are a concise dictionary.",
      input,
      reasoning: {
        effort: reasoningEffort,
      },
      max_output_tokens: 500,
      text: {
        verbosity: "low",
      },
    };

    const response = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await readErrorBody(response);
      throw new Error(`OpenAI request failed with status ${response.status}: ${errorData}`);
    }

    const data: unknown = await response.json();
    const aiReply = extractOpenAIText(data);

    if (!aiReply) {
      console.error("Invalid OpenAI response payload:", data);
      throw new Error("Invalid response format from OpenAI");
    }

    return aiReply;
  }
}
