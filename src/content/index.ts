import "../shared/globals";
import { installPromptGlobals } from "./prompts";
import { initContentController } from "./controller";
import { initYouTubeSubtitleSelectionFixes } from "./youtube";

const INIT_FLAG = "__gemTextAnalyzerInitialized";

type InitGlobal = typeof globalThis & {
  [INIT_FLAG]?: boolean;
};

function boot(): void {
  const root = globalThis as InitGlobal;
  if (root[INIT_FLAG]) {
    return;
  }

  if (!document.body) {
    return;
  }

  root[INIT_FLAG] = true;
  installPromptGlobals();
  initYouTubeSubtitleSelectionFixes();

  const initialized = initContentController();
  if (!initialized && !document.querySelector("#my-ai-helper-host")) {
    root[INIT_FLAG] = false;
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
