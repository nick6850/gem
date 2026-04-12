#!/bin/bash

# Test cases for the dictionary prompt against Ollama
# Run: ./test-prompts.sh
# Passing is manual — compare actual vs reference and check the reasoning holds

SYSTEM="You are a knowledgeable, simple dictionary. Give the definition that fits the context. One or two short sentences, starts uppercase, ends with period. Only commas allowed. Do not borrow words or concepts from the context sentence. Use normal everyday language, not formal or technical. For proper nouns and products, mention what makes them known. The user may ask follow-up questions, just answer them naturally. Never ask the user to provide a word or clarify, just do your best with what they said. Define only the exact word given, not the surrounding phrase. Give one single definition, never list alternatives or second meanings. If the word itself carries a figurative meaning in the context, use that meaning. But if the word is just part of a larger fixed expression, still define just the word on its own, not the whole expression."

query() {
  local context="$1" word="$2"
  curl -s http://localhost:11434/api/chat \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg sys "$SYSTEM" --arg msg "Context: \"$context\" Word: \"$word\"" \
      '{model:"gemma4:26b",messages:[{role:"system",content:$sys},{role:"user",content:$msg}],temperature:0,stream:false,think:false}')" \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['message']['content'])"
}

echo "=== Prompt Test Suite ==="
echo "System: $SYSTEM"
echo ""

# Format: context | word | check description | reference answer
declare -a TESTS=(
  "Look, Anthropic built a C compiler with an agent swarm.|swarm|general noun, no 'agents' leak|A large, active group of individuals."
  "But surely the next generation of LLMs will fix it. Pinky promise!|Pinky|just the finger, no 'vow/promise' leak|The smallest finger on the human hand."
  "Distribute, divide and conquer, autonomy, dark factories, software is solved in the next 6 months.|dark factories|noun defined as noun|Automated manufacturing facilities, operating without human presence."
  "Yes, of course, its not really working and it needed a human to spin the wheel a little bit every now and then.|spin the wheel|figurative meaning|Manually intervene, adjust, or manipulate."
  "Oh my god, Cursor built a browser with a battalion of agents.|Cursor|specific enough to understand|An AI-powered code editor."
  "the server crashed|crashed|simple verb|Failed, ceased functioning."
  "she nailed the presentation|nailed|figurative verb|Performed perfectly."
  "I ask them from time to time about their progress.|from time to time|common phrase|Occasionally, periodically."
  "You want to fill me in?|fill|exact word only, not phrasal verb|To make something full or complete."
  "Coding agents are sirens, luring you in with their speed.|sirens|mythology origin when relevant|Creatures from Greek mythology that lured sailors to their doom with enchanting songs, now meaning anything tempting but dangerous."
)

for test in "${TESTS[@]}"; do
  IFS='|' read -r context word check reference <<< "$test"
  actual=$(query "$context" "$word")
  echo "[$check] \"$word\""
  echo "  ref: $reference"
  echo "  got: $actual"
  echo ""
done

echo "=== ${#TESTS[@]} tests ran ==="
