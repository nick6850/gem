// == Local LLM API details ==
async function analyzeWithLocalLLM(selectedText, context, isFollowUp = false) {
  const API_ENDPOINT = "http://localhost:11434/api/chat";

  if (!selectedText.trim() && !isFollowUp) {
    throw new Error("Empty selected text provided");
  }

  ///////////////////////////////////////////
  // == Build or update the conversation ==
  ///////////////////////////////////////////

  if (isFollowUp) {
    // User follow-up question - add to conversation history
    conversationHistory.push({
      role: "user",
      content: selectedText,
    });
  } else {
    // First time analysis - build initial prompt and start fresh history
    const initialPrompt = buildAnalysisPrompt(selectedText, context, 'local', movieModeEnabled);

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

  // Build messages array for OpenAI-compatible API (includes full history)
  const messages = conversationHistory.map(msg => ({
    role: msg.role,
    content: msg.content
  }));

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

    // Capture the AI's reply in conversation history
    const aiReply = data.message.content;
    conversationHistory.push({
      role: "assistant",
      content: aiReply,
    });

    console.log("📥 Conversation history after response:", conversationHistory.length, "messages");

    return aiReply;
  } catch (error) {
    console.error("Local LLM Error:", error);
    // Remove the last user message from history if the API call failed
    if (isFollowUp && conversationHistory.length > 0) {
      conversationHistory.pop();
    }
    throw error; // Re-throw to handle in the calling function
  }
}
