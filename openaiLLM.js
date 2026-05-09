function getOpenAIConfig() {
  const config = globalThis.GEM_CONFIG?.openai;
  if (!config?.apiKey) {
    throw new Error("OpenAI API key not configured in GEM_CONFIG.openai.apiKey");
  }

  return {
    apiKey: config.apiKey,
    model: config.model || "gpt-5.4-mini",
    reasoningEffort: config.reasoningEffort || "low",
  };
}

function extractOpenAIText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  for (const item of data?.output || []) {
    if (item?.type !== "message" || !Array.isArray(item.content)) {
      continue;
    }

    for (const part of item.content) {
      if (
        (part?.type === "output_text" || part?.type === "text") &&
        typeof part.text === "string" &&
        part.text.trim()
      ) {
        return part.text.trim();
      }
    }
  }

  return "";
}

async function analyzeWithOpenAILLM(selectedText, context, isFollowUp = false) {
  const API_ENDPOINT = "https://api.openai.com/v1/responses";
  const { apiKey, model, reasoningEffort } = getOpenAIConfig();

  if (!selectedText.trim() && !isFollowUp) {
    throw new Error("Empty selected text provided");
  }

  if (isFollowUp) {
    conversationHistory.push({
      role: "user",
      content: selectedText,
    });
  } else {
    const initialPrompt = buildAnalysisPrompt(
      selectedText,
      context,
      "local",
      movieModeEnabled
    );

    conversationHistory = [
      {
        role: "system",
        content: FOLLOWUP_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: initialPrompt,
      },
    ];
  }

  const input = conversationHistory.map((msg) => ({
    role: msg.role,
    content: [{ type: "input_text", text: msg.content }],
  }));

  try {
    const requestBody = {
      model,
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
      const errorData = await response.text();
      throw new Error(
        `OpenAI request failed with status ${response.status}: ${errorData}`
      );
    }

    const data = await response.json();
    const aiReply = extractOpenAIText(data);

    if (!aiReply) {
      console.error("Invalid OpenAI response payload:", data);
      throw new Error("Invalid response format from OpenAI");
    }

    conversationHistory.push({
      role: "assistant",
      content: aiReply,
    });

    return aiReply;
  } catch (error) {
    console.error("OpenAI API Error:", error);
    if (isFollowUp && conversationHistory.length > 0) {
      conversationHistory.pop();
    }
    throw error;
  }
}
