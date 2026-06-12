# Text Analyzer Extension

Manifest V3 browser extension for analyzing selected text with OpenAI, a local LLM, or Gemini.

## Development

```sh
npm install
npm run build
npm test
```

The extension loads built files from `dist/`. During development, use:

```sh
npm run build:watch
```

## Provider Config

Tracked source does not contain API keys. Create `.env.local` from `.env.example` for local builds:

```sh
OPENAI_API_KEY=...
GEMINI_API_KEY=...
```

Tests can still override runtime config with `globalThis.GEM_CONFIG`.
