// == Local LLM API details ==
async function analyzeWithLocalLLM(selectedText, context, isFollowUp = false) {
  const API_ENDPOINT = "http://localhost:1234/v1/chat/completions";

  if (!selectedText.trim() && !isFollowUp) {
    throw new Error("Empty selected text provided");
  }

  ///////////////////////////////////////////
  // == Build or update the conversation ==
  ///////////////////////////////////////////
  let messages;

  if (isFollowUp) {
    // User follow-up question - add to conversation history
    conversationHistory.push({
      role: "user",
      content: selectedText, // This is the user question for follow-ups
    });

    // Use full conversation history for follow-ups (don't slice off the current question)
    messages = [
      { role: "system", content: FOLLOWUP_SYSTEM_PROMPT },
      { role: "user", content: buildConversationPrompt(conversationHistory, selectedText) }
    ];
  } else {
    // First time analysis
    const systemPrompt = buildAnalysisPrompt(selectedText, context, 'local');

    conversationHistory = [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: `Selected text: "${selectedText}"\nContext: "${context}"`,
      },
    ];

    messages = [
      { role: "system", content: systemPrompt },
    ];
  }

  try {
    const requestBody = {
      model: "deepseek-llm-7b-chat",
      messages: messages, 
      temperature: 0,
      max_tokens: 100, 
      stream: false,
    };

    console.log(
      "Sending request to local LLM:",
      JSON.stringify(requestBody, null, 2)
    );

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

    if (!data.choices?.[0]?.message?.content) {
      console.error("Invalid local LLM response format:", data);
      throw new Error("Invalid response format from local LLM");
    }

    // Capture the AI's reply in conversation history
    const aiReply = data.choices[0].message.content;
    conversationHistory.push({
      role: "assistant", // Use the standard 'assistant' role
      content: aiReply,
    });

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
