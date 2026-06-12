import { requireGeminiConfig } from "../shared/config";
import type { AnalyzeRequest, AnalyzerClient, ChatMessage } from "../shared/types";
import { isRecord, readErrorBody } from "./guards";

function toGeminiRole(role: ChatMessage["role"]): "user" | "model" {
  return role === "assistant" ? "model" : "user";
}

function extractGeminiText(data: unknown): string {
  if (!isRecord(data) || !Array.isArray(data.candidates)) {
    return "";
  }

  const [candidate] = data.candidates;
  if (!isRecord(candidate) || !isRecord(candidate.content) || !Array.isArray(candidate.content.parts)) {
    return "";
  }

  const [part] = candidate.content.parts;
  if (!isRecord(part) || typeof part.text !== "string") {
    return "";
  }

  return part.text;
}

export class GeminiClient implements AnalyzerClient {
  async analyze(request: AnalyzeRequest): Promise<string> {
    const { apiKey, model } = requireGeminiConfig();
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const systemMessage = request.messages.find((msg) => msg.role === "system");
    const contents = request.messages
      .filter((msg) => msg.role !== "system")
      .map((msg) => ({
        role: toGeminiRole(msg.role),
        parts: [{ text: msg.content }],
      }));

    const requestBody: {
      contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }>;
      safetySettings: Array<{ category: string; threshold: string }>;
      systemInstruction?: { parts: Array<{ text: string }> };
    } = {
      contents,
      safetySettings: [
        {
          category: "HARM_CATEGORY_HATE_SPEECH",
          threshold: "BLOCK_NONE",
        },
        {
          category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
          threshold: "BLOCK_NONE",
        },
        {
          category: "HARM_CATEGORY_DANGEROUS_CONTENT",
          threshold: "BLOCK_NONE",
        },
        {
          category: "HARM_CATEGORY_HARASSMENT",
          threshold: "BLOCK_NONE",
        },
        {
          category: "HARM_CATEGORY_CIVIC_INTEGRITY",
          threshold: "BLOCK_NONE",
        },
      ],
    };

    if (request.isFollowUp && systemMessage) {
      requestBody.systemInstruction = {
        parts: [{ text: systemMessage.content }],
      };
    }

    console.log("📤 Sending to Gemini. Conversation history length:", request.messages.length);
    console.log("📤 Contents:", JSON.stringify(contents, null, 2));

    const response = await fetch(`${endpoint}?key=${apiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    console.log("Received response status:", response.status);

    if (!response.ok) {
      const errorData = await readErrorBody(response);
      console.error("API Error Response:", errorData);
      throw new Error(`API request failed with status ${response.status}: ${errorData}`);
    }

    const data: unknown = await response.json();
    console.log("API Response data:", data);

    const aiReply = extractGeminiText(data);
    if (!aiReply) {
      console.error("Invalid API response format:", data);
      throw new Error("Invalid response format from API");
    }

    return aiReply;
  }
}
