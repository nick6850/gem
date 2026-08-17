import type { QuickPrompt } from "../shared/types";

export const QUICK_PROMPTS: readonly QuickPrompt[] = [
  {
    label: "RU",
    userMessage: "Translate to Russian",
    aiPrompt: 'Translate "${selectedText}" into good everyday natural Russian. Just the russian translation, no extra comments.',
    errorContext: "Russian translation",
  },
  {
    label: "Example",
    userMessage: "For example?",
    aiPrompt: "For example?",
    errorContext: "Example",
  },
  {
    label: "Context",
    userMessage: "What does it mean in this context?",
    aiPrompt: "What does it mean in this context in 1 sentence?",
    errorContext: "What does it mean in this context?",
  },
  {
    label: "Sentence",
    userMessage: "Use it in a sentence",
    aiPrompt:
      "I am an English learner. Create one natural sentence using the selected word once with the same contextual meaning, like an example in a dictionary. Use a new, unrelated situation. Do not reuse distinctive people, objects, actions, places, or subject matter from the original context. Return just that sentence.",
    errorContext: "Use it in another sentence.",
  },
  {
    label: "Culture",
    userMessage: "Explain cultural background",
    aiPrompt:
      "Give short cultural and/or historical overview that would be interesting for me as an American. Use 1 sentence.",
    errorContext: "Cultural background",
  },
  {
    label: "Origin",
    userMessage: "Why does it mean that?",
    aiPrompt: "Why does it mean what it means? What does it originate from? In 1 sentence.",
    errorContext: "Origin of the text",
  },
  {
    label: "More",
    userMessage: "More",
    aiPrompt: "More.",
    errorContext: "More.",
  },
  {
    label: "Simplify",
    userMessage: "Explain in simpler terms",
    aiPrompt: "Explain this in simpler, easier to understand terms. No metaphors. In 1 sentence.",
    errorContext: "Simpler explanation",
  },
];
