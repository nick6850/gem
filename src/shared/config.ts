import "./globals";
import type { GeminiConfig, LLMProvider, LocalLLMConfig, OpenAIConfig, RuntimeConfig } from "./types";

interface ResolvedOpenAIConfig {
  apiKey: string;
  model: string;
  reasoningEffort: string;
}

interface ResolvedGeminiConfig {
  apiKey: string;
  model: string;
}

interface ResolvedLocalLLMConfig {
  endpoint: string;
  model: string;
}

const FALLBACK_CONFIG: RuntimeConfig = {
  defaultProvider: "openai",
  openai: {
    model: "gpt-5.4-mini",
    reasoningEffort: "low",
  },
  gemini: {
    model: "gemini-2.5-flash-lite",
  },
  local: {
    endpoint: "http://localhost:11434/api/chat",
    model: "gemma4:26b",
  },
};

function mergeOpenAIConfig(base?: OpenAIConfig, override?: OpenAIConfig): OpenAIConfig {
  return {
    apiKey: override?.apiKey ?? base?.apiKey,
    model: override?.model ?? base?.model,
    reasoningEffort: override?.reasoningEffort ?? base?.reasoningEffort,
  };
}

function mergeGeminiConfig(base?: GeminiConfig, override?: GeminiConfig): GeminiConfig {
  return {
    apiKey: override?.apiKey ?? base?.apiKey,
    model: override?.model ?? base?.model,
  };
}

function mergeLocalConfig(base?: LocalLLMConfig, override?: LocalLLMConfig): LocalLLMConfig {
  return {
    endpoint: override?.endpoint ?? base?.endpoint,
    model: override?.model ?? base?.model,
  };
}

function getBuildConfig(): RuntimeConfig {
  return typeof __BUILD_CONFIG__ === "object" && __BUILD_CONFIG__ ? __BUILD_CONFIG__ : {};
}

export function getRuntimeConfig(): RuntimeConfig {
  const buildConfig = getBuildConfig();
  const globalConfig = globalThis.GEM_CONFIG ?? {};

  return {
    defaultProvider:
      globalConfig.defaultProvider ?? buildConfig.defaultProvider ?? FALLBACK_CONFIG.defaultProvider,
    openai: mergeOpenAIConfig(
      mergeOpenAIConfig(FALLBACK_CONFIG.openai, buildConfig.openai),
      globalConfig.openai
    ),
    gemini: mergeGeminiConfig(
      mergeGeminiConfig(FALLBACK_CONFIG.gemini, buildConfig.gemini),
      globalConfig.gemini
    ),
    local: mergeLocalConfig(
      mergeLocalConfig(FALLBACK_CONFIG.local, buildConfig.local),
      globalConfig.local
    ),
  };
}

export function getDefaultProvider(): LLMProvider {
  return getRuntimeConfig().defaultProvider ?? "openai";
}

export function requireOpenAIConfig(): ResolvedOpenAIConfig {
  const config = getRuntimeConfig().openai;
  if (!config?.apiKey) {
    throw new Error("OpenAI API key not configured. Set OPENAI_API_KEY in .env.local or GEM_CONFIG.openai.apiKey.");
  }

  return {
    apiKey: config.apiKey,
    model: config.model ?? "gpt-5.4-mini",
    reasoningEffort: config.reasoningEffort ?? "low",
  };
}

export function requireGeminiConfig(): ResolvedGeminiConfig {
  const config = getRuntimeConfig().gemini;
  if (!config?.apiKey) {
    throw new Error("Gemini API key not configured. Set GEMINI_API_KEY in .env.local or GEM_CONFIG.gemini.apiKey.");
  }

  return {
    apiKey: config.apiKey,
    model: config.model ?? "gemini-2.5-flash-lite",
  };
}

export function getLocalConfig(): ResolvedLocalLLMConfig {
  const config = getRuntimeConfig().local;
  return {
    endpoint: config?.endpoint ?? "http://localhost:11434/api/chat",
    model: config?.model ?? "gemma4:26b",
  };
}
