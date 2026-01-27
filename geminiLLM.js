// == Gemini API details ==
async function analyzeWithGeminiLLM(selectedText, context, isFollowUp = false) {
  const API_ENDPOINT =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent";
  const API_KEY = "AIzaSyC9jnmAh_cyvg0hNa5bejNtKGRhkDC4noE"; // DONT DELETE

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
    const initialPrompt = buildAnalysisPrompt(selectedText, context, 'gemini', movieModeEnabled);
    
    conversationHistory = [
      {
        role: "user",
        content: `${initialPrompt}\n\nSelected text: "${selectedText}"\nContext: "${context}"`,
      },
    ];
  }

  // Build Gemini-format contents array from conversation history
  const contents = conversationHistory.map(msg => ({
    role: msg.role === "assistant" ? "model" : "user",
    parts: [{ text: msg.content }]
  }));

  // Add system instruction for follow-ups
  let systemInstruction = null;
  if (isFollowUp) {
    systemInstruction = {
      parts: [{ text: FOLLOWUP_SYSTEM_PROMPT }]
    };
  }

  try {
    const requestBody = {
      contents: contents,
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

    // Add system instruction if it's a follow-up
    if (systemInstruction) {
      requestBody.systemInstruction = systemInstruction;
    }

    console.log("📤 Sending to Gemini. Conversation history length:", conversationHistory.length);
    console.log("📤 Contents:", JSON.stringify(contents, null, 2));

    const response = await fetch(`${API_ENDPOINT}?key=${API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    console.log("Received response status:", response.status);

    if (!response.ok) {
      const errorData = await response.text();
      console.error("API Error Response:", errorData);
      throw new Error(
        `API request failed with status ${response.status}: ${errorData}`
      );
    }

    const data = await response.json();
    console.log("API Response data:", data);

    if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
      console.error("Invalid API response format:", data);
      throw new Error("Invalid response format from API");
    }

    // Capture the AI's reply in conversation history
    const aiReply = data.candidates[0].content.parts[0].text;
    conversationHistory.push({
      role: "assistant",
      content: aiReply,
    });

    console.log("📥 Conversation history after response:", conversationHistory.length, "messages");

    return aiReply;
  } catch (error) {
    console.error("Gemini API Error:", error);
    // Remove the last user message from history if the API call failed
    if (isFollowUp && conversationHistory.length > 0) {
      conversationHistory.pop();
    }
    throw error; // Re-throw to handle in the calling function
  }
}
