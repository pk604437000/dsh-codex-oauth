import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

const h = React.createElement;
const BASE = "/plugins/dsh-codex-oauth/auth/session-service-tier";
export const SESSION_TIER_LOCALE = "codex-session-tier";
export const SERVICE_TIER_EVENT = "dsh-codex-service-tier-changed";
export const sessionTierMessages = {
  en: { label: "Service tier", aria: "Session service tier", inherit: "Inherit default", standard: "Standard", fast: "Fast", loading: "loading", requested: "Requested tier for this conversation only. Fast requests priority and may use more allowance; the server may return Standard.", unavailable: "Persistent session settings are unavailable." },
  zh: { label: "服务档位", aria: "会话服务档位", inherit: "继承默认", standard: "Standard", fast: "Fast", loading: "读取中", requested: "仅设置本会话请求的档位。Fast 请求 priority，可能增加额度消耗；服务端仍可能返回 Standard。", unavailable: "当前会话设置暂不可持久化。" },
};

export function notifyServiceTierChange(sessionId) {
  window.dispatchEvent(new window.CustomEvent(SERVICE_TIER_EVENT, { detail: { sessionId } }));
}
function snapshot(value, sessionId) {
  if (value?.sessionId !== sessionId || !["inherit", "default", "fast"].includes(value.selection)
    || !["default", "fast"].includes(value.effectiveTier) || !["default", "fast"].includes(value.defaultTier)
    || typeof value.writable !== "boolean") throw new Error("Invalid session settings response");
  return value;
}
export async function requestSessionTier(sessionId, value, signal) {
  const query = `session_id=${encodeURIComponent(sessionId)}${value === undefined ? "" : `&value=${encodeURIComponent(value)}`}`;
  const response = await fetch(`${BASE}?${query}`, { method: value === undefined ? "GET" : "POST", signal, credentials: "same-origin", headers: { accept: "application/json" } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : `HTTP ${response.status}`);
  const state = snapshot(data, sessionId);
  if (value !== undefined) notifyServiceTierChange(sessionId);
  return state;
}

const EMPTY_DIRECTORY = { current: null };
const english = (key) => sessionTierMessages.en[key] ?? key;
function SessionTierInstance({ sessionId, directory, loadModel, available = false, request = requestSessionTier, t = english }) {
  const model = useSyncExternalStore((notify) => directory?.subscribe(notify) ?? (() => {}), () => directory?.getSnapshot() ?? EMPTY_DIRECTORY);
  const codex = model.current?.provider === "openai-codex";
  const ready = available && typeof sessionId === "string" && sessionId.length > 0 && codex;
  const [state, setState] = useState({ snapshot: null, error: "", busy: false });
  const sequence = useRef(0), alive = useRef(false), saving = useRef(false), reads = useRef(new Set()), invalidated = useRef(false);
  const current = (generation) => alive.current && generation === sequence.current;
  useEffect(() => { if (available && sessionId) Promise.resolve(loadModel?.()).catch(() => {}); }, [available, sessionId, loadModel]);
  const refresh = useCallback((preserveError = false) => {
    if (!ready || saving.current) return Promise.resolve();
    const generation = ++sequence.current;
    const controller = new AbortController(); reads.current.add(controller);
    return request(sessionId, undefined, controller.signal).then((value) => {
      const next = snapshot(value, sessionId);
      if (current(generation)) setState((previous) => ({ snapshot: next, error: preserveError ? previous.error : "", busy: false }));
    }).catch((error) => {
      if (current(generation) && !controller.signal.aborted) setState((previous) => ({ ...previous, error: preserveError && previous.error ? previous.error : error.message }));
    }).finally(() => reads.current.delete(controller));
  }, [ready, sessionId, request]);
  useEffect(() => {
    alive.current = true;
    setState((previous) => ({ ...previous, busy: false }));
    if (ready) refresh();
    const timer = ready ? setInterval(refresh, 30_000) : undefined;
    const changed = (event) => {
      if (event.detail?.sessionId && event.detail.sessionId !== sessionId) return;
      if (saving.current) invalidated.current = true;
      else refresh();
    };
    if (ready) window.addEventListener(SERVICE_TIER_EVENT, changed);
    return () => {
      alive.current = false; saving.current = false; invalidated.current = false; sequence.current++;
      for (const controller of reads.current) controller.abort();
      reads.current.clear();
      if (timer !== undefined) clearInterval(timer);
      window.removeEventListener(SERVICE_TIER_EVENT, changed);
    };
  }, [ready, refresh, sessionId]);
  const change = async (value) => {
    if (!ready || !state.snapshot?.writable || saving.current) return;
    const generation = ++sequence.current;
    saving.current = true;
    setState((previous) => ({ ...previous, busy: true, error: "" }));
    try {
      const next = snapshot(await request(sessionId, value), sessionId);
      if (current(generation)) setState({ snapshot: next, error: "", busy: true });
    } catch (error) {
      if (current(generation)) setState((previous) => ({ ...previous, error: error.message }));
    } finally {
      if (current(generation)) {
        saving.current = false;
        setState((previous) => ({ ...previous, busy: false }));
        // Replay defaults/peer-pane invalidations only after this write settles.
        if (invalidated.current) { invalidated.current = false; refresh(true); }
      }
    }
  };
  if (!ready) return null;
  const value = state.snapshot;
  const inherited = value ? t(value.defaultTier === "fast" ? "fast" : "standard") : t("loading");
  return h("span", { style: { display: "inline-flex", flexDirection: "column", gap: 3, maxWidth: 280, fontSize: 12 } },
    h("label", { title: value?.writable === false ? t("unavailable") : t("requested"), style: { display: "inline-flex", alignItems: "center", gap: 6 } },
      h("span", null, t("label")),
      h("select", { "aria-label": t("aria"), value: value?.selection ?? "inherit", disabled: !value?.writable || state.busy,
        style: { maxWidth: 180, font: "inherit", color: "inherit", background: "var(--dsw-alias-bg-base, transparent)", border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 6, padding: "3px 5px" },
        onChange: (event) => change(event.target.value) },
      h("option", { value: "inherit" }, `${t("inherit")} (${inherited})`),
      h("option", { value: "default" }, t("standard")),
      h("option", { value: "fast" }, t("fast")))),
    state.error ? h("span", { role: "status", style: { color: "var(--dsw-alias-state-error-primary)", overflowWrap: "anywhere" } }, state.error) : null);
}

/** Remount asynchronous state when the same view receives a different session. */
export function SessionServiceTierControl(props) {
  return h(SessionTierInstance, { ...props, key: props.sessionId ?? "unbound" });
}
