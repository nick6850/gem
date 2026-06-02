// == Local LLM API details ==
async function analyzeWithLocalLLM(selectedText, context, isFollowUp = false) {
  const API_ENDPOINT = "http://localhost:11434/api/chat";

  beginConversationTurn({
    selectedText,
    context,
    isFollowUp,
    promptProvider: "local",
    includeSystemMessage: true,
  });

  const messages = toPlainConversationMessages();

  try {
    const requestBody = {
      model: "gemma4:26b",
      messages: messages,
      stream: false,
      think: false,
      options: {
        temperature: 0,
        num_predict: 500,
      },
    };

    console.log("📤 Sending to Local LLM. Conversation history length:", conversationHistory.length);
    console.log("📤 Messages:", JSON.stringify(messages, null, 2));

    const response = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    console.log("Received response status:", response.status);

    if (!response.ok) {
      const errorData = await response.text();
      console.error("Local LLM Error Response:", errorData);
      throw new Error(
        `Local LLM request failed with status ${response.status}: ${errorData}`
      );
    }

    const data = await response.json();
    console.log("Local LLM Response data:", data);

    if (!data.message?.content) {
      console.error("Invalid local LLM response format:", data);
      throw new Error("Invalid response format from local LLM");
    }

    const aiReply = data.message.content;
    appendAssistantReply(aiReply);

    console.log("📥 Conversation history after response:", conversationHistory.length, "messages");

    return aiReply;
  } catch (error) {
    console.error("Local LLM Error:", error);
    rollbackFollowUpTurn(isFollowUp);
    throw error;
  }
}
