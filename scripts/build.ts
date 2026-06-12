import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import * as esbuild from "esbuild";
import type { LLMProvider, RuntimeConfig } from "../src/shared/types";

const rootDir = resolve(import.meta.dirname, "..");
const distDir = resolve(rootDir, "dist");
const watch = process.argv.includes("--watch");

function readEnvFile(path: string): Record<string, string> {
  try {
    return Object.fromEntries(
      readFileSync(path, "utf8")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"))
        .map((line) => {
          const separator = line.indexOf("=");
          if (separator === -1) {
            return [line, ""];
          }

          const key = line.slice(0, separator).trim();
          const rawValue = line.slice(separator + 1).trim();
          const value = rawValue.replace(/^['"]|['"]$/g, "");
          return [key, value];
        })
    );
  } catch {
    return {};
  }
}

const fileEnv = readEnvFile(resolve(rootDir, ".env.local"));
const env: Record<string, string | undefined> = { ...process.env, ...fileEnv };

function optionalString(value: string | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function provider(value: string | undefined): LLMProvider {
  return value === "local" || value === "gemini" ? value : "openai";
}

const buildConfig: RuntimeConfig = {
  defaultProvider: provider(env.GEM_DEFAULT_PROVIDER),
  openai: {
    apiKey: optionalString(env.OPENAI_API_KEY),
    model: optionalString(env.OPENAI_MODEL) ?? "gpt-5.4-mini",
    reasoningEffort: optionalString(env.OPENAI_REASONING_EFFORT) ?? "low",
  },
  gemini: {
    apiKey: optionalString(env.GEMINI_API_KEY),
    model: optionalString(env.GEMINI_MODEL) ?? "gemini-2.5-flash-lite",
  },
  local: {
    endpoint: optionalString(env.LOCAL_ENDPOINT) ?? "http://localhost:11434/api/chat",
    model: optionalString(env.LOCAL_MODEL) ?? "gemma4:26b",
  },
};

const define = {
  __BUILD_CONFIG__: JSON.stringify(buildConfig),
};

const entries = [
  ["src/content/index.ts", "content.js"],
  ["src/background/index.ts", "background.js"],
  ["src/offscreen/index.ts", "offscreen.js"],
] as const;

const commonOptions: Omit<esbuild.BuildOptions, "entryPoints" | "outfile"> = {
  absWorkingDir: rootDir,
  bundle: true,
  define,
  format: "iife",
  legalComments: "none",
  logLevel: "info",
  platform: "browser",
  sourcemap: false,
  target: ["chrome118"],
};

async function buildAll(): Promise<void> {
  rmSync(distDir, { force: true, recursive: true });
  mkdirSync(distDir, { recursive: true });
  await Promise.all(
    entries.map(([entryPoint, outfile]) =>
      esbuild.build({
        ...commonOptions,
        entryPoints: [entryPoint],
        outfile: resolve(distDir, outfile),
      })
    )
  );
}

async function watchAll(): Promise<void> {
  mkdirSync(distDir, { recursive: true });
  const contexts = await Promise.all(
    entries.map(([entryPoint, outfile]) =>
      esbuild.context({
        ...commonOptions,
        entryPoints: [entryPoint],
        outfile: resolve(distDir, outfile),
      })
    )
  );

  await Promise.all(contexts.map((context) => context.watch()));
  console.log("Watching TypeScript extension bundles...");
}

if (watch) {
  await watchAll();
} else {
  await buildAll();
}
