import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { OPENAI_CODEX_PROVIDER } from "./store.js";

export function tuiDataDir() {
  return join(homedir(), ".dsh-tui");
}

export function tuiModelPrefPath(dir = tuiDataDir()) {
  return join(dir, "model.json");
}

/** @returns {{ provider: string, model: string } | undefined} */
export function readTuiModelPref(dir = tuiDataDir()) {
  try {
    const parsed = JSON.parse(readFileSync(tuiModelPrefPath(dir), "utf8"));
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    const { provider, model } = parsed;
    if (typeof provider !== "string" || provider === "") return undefined;
    if (typeof model !== "string" || model === "") return undefined;
    return { provider, model };
  } catch {
    return undefined;
  }
}

export function selectedTuiProvider(adapter, readTuiRoute = readTuiModelPref) {
  return readTuiRoute()?.provider ?? adapter?.selectedProvider;
}

export function shouldShowCodexQuota(adapter, readTuiRoute = readTuiModelPref) {
  return selectedTuiProvider(adapter, readTuiRoute) === OPENAI_CODEX_PROVIDER;
}
