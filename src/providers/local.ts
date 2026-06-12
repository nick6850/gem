import { getLocalConfig } from "../shared/config";
import type { AnalyzeRequest, AnalyzerClient } from "../shared/types";
import { isRecord, readErrorBody } from "./guards";

function extractLocalText(data: unknown): string {
  if (!isRecord(data) || !isRecord(data.message) || typeof data.message.content !== "string") {
    return "";
  }

  return data.message.content;
}

export class LocalLLMClient implements AnalyzerClient {
  async analyze(request: AnalyzeRequest): Promise<string> {
    const { endpoint, model } = getLocalConfig();
    const requestBody = {
      model,
      messages: request.messages,
      stream: false,
      think: false,
      options: {
        temperature: 0,
        num_predict: 500,
      },
    };

    console.log("📤 Sending to Local LLM. Conversation history length:", request.messages.length);
    console.log("📤 Messages:", JSON.stringify(request.messages, null, 2));

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    console.log("Received response status:", response.status);

    if (!response.ok) {
      const errorData = await readErrorBody(response);
      console.error("Local LLM Error Response:", errorData);
      throw new Error(`Local LLM request failed with status ${response.status}: ${errorData}`);
    }

    const data: unknown = await response.json();
    console.log("Local LLM Response data:", data);

    const aiReply = extractLocalText(data);
    if (!aiReply) {
      console.error("Invalid local LLM response format:", data);
      throw new Error("Invalid response format from local LLM");
    }

    return aiReply;
  }
}
