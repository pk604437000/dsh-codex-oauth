import React, { useCallback, useEffect, useRef, useState } from "react";
import { ServiceTierControl } from "./service-tier.jsx";
import { SessionServiceTierControl, requestSessionTier, notifyServiceTierChange, sessionTierMessages, SESSION_TIER_LOCALE } from "./session-service-tier.jsx";

const BASE = "/plugins/dsh-codex-oauth/auth";
const h = React.createElement;
async function request(path, method = "GET") {
  const response = await fetch(`${BASE}/${path}`, { method, credentials: "same-origin", headers: { accept: "application/json" } });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof value.error === "string" ? value.error : `HTTP ${response.status}`);
  return value;
}
function QuotaPanel({ quota }) {
  if (!quota?.available) return h("div", { role: "status" }, "Quota unavailable. No current quota data is available.");
  return h("div", { style: { display: "flex", flexDirection: "column", gap: 12 } },
    ...quota.buckets.map((bucket) => h("section", { key: bucket.id },
      h("strong", null, bucket.name ?? bucket.id),
      ...bucket.windows.map((window, index) => {
        const remaining = Math.round(window.remainingPercent);
        const color = window.stale ? "#888" : remaining <= 10 ? "#c44" : remaining <= 30 ? "#b88020" : "#38875c";
        return h("div", { key: index, style: { marginTop: 8 } },
          h("div", null, `${window.label}: ${remaining}% remaining${window.stale ? " (stale)" : ""}`),
          h("div", { role: "progressbar", "aria-label": `${window.label} quota remaining`, "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": window.remainingPercent,
            style: { height: 7, background: "var(--dsw-alias-border-l2)", borderRadius: 4, marginTop: 4 } },
            h("div", { style: { width: `${window.remainingPercent}%`, height: "100%", background: color, borderRadius: 4 } })),
          h("small", null, window.resetsAt ? `Reset: ${new Date(window.resetsAt * 1000).toLocaleString("en-US")}` : "Reset time unavailable"),
          h("small", { style: { display: "block" } }, `Updated: ${new Date(window.checkedAt).toLocaleString("en-US")}`));
      }))),
    h("small", null, "Quota checks do not call a model."));
}
function CodexSettings() {
  const [state, setState] = useState({ status: "loading" });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const authorization = useRef({ popup: null, url: null });
  const statusGeneration = useRef(0);
  const openChallenge = (challenge, popup = authorization.current.popup) => {
    if (!popup || popup.closed) return;
    if (authorization.current.url === challenge.url) return;
    popup.location.replace(challenge.url);
    authorization.current = { popup, url: challenge.url };
  };
  useEffect(() => {
    if (state.challenge) openChallenge(state.challenge);
  }, [state.challenge?.url]);
  const refresh = useCallback(() => {
    const generation = ++statusGeneration.current;
    return request("status").then((value) => {
      if (generation === statusGeneration.current) setState(value);
    }).catch((error) => {
      if (generation === statusGeneration.current) setState((current) => ({ ...current, status: "error", message: error.message }));
    });
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (!["signing-in", "quota-signing-in"].includes(state.status)) return undefined;
    const timer = setInterval(refresh, 1000);
    return () => clearInterval(timer);
  }, [refresh, state.status]);
  const signIn = async (newAccount = false) => {
    const popup = window.open("about:blank", "_blank");
    if (!popup) { setState({ ...state, status: "error", message: "Allow pop-ups to complete sign-in." }); return; }
    popup.opener = null;
    authorization.current = { popup, url: null };
    setBusy(true); setState({ ...state, status: "signing-in" }); setNotice("");
    try { const challenge = await request(`login${newAccount ? "?new_account=1" : ""}`, "POST"); openChallenge(challenge, popup); }
    catch (error) { popup.close(); setState({ ...state, status: "error", message: error.message }); }
    finally { setBusy(false); }
  };
  const signOut = async () => {
    setBusy(true);
    try {
      const result = await request("logout", "POST");
      if (!result.remoteRevoked) setNotice("Signed out locally. Remote revocation was not confirmed; disconnect the app in ChatGPT usage settings.");
      await refresh();
    } catch (error) { setState({ ...state, status: "error", message: error.message }); }
    finally { setBusy(false); }
  };
  const selectAccount = async (clientId) => {
    setBusy(true); setNotice("");
    try { setState(await request(`account?client_id=${encodeURIComponent(clientId)}`, "POST")); }
    catch (error) { setState({ ...state, status: "error", message: error.message }); }
    finally { setBusy(false); }
  };
  const refreshModels = async () => {
    setBusy(true);
    try { const { models } = await request("models", "POST"); setNotice(`Refreshed ${models.length} available models.`); }
    catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  };
  const connectQuota = async () => {
    const popup = window.open("about:blank", "_blank");
    if (!popup) { setNotice("Allow pop-ups to connect quota."); return; }
    popup.opener = null; setBusy(true); setNotice("");
    authorization.current = { popup, url: null };
    try {
      const challenge = await request("quota/login", "POST");
      openChallenge(challenge, popup); await refresh();
    } catch (error) { popup.close(); setNotice(error.message); }
    finally { setBusy(false); }
  };
  const disconnectQuota = async () => {
    setBusy(true);
    try { await request("quota/logout", "POST"); await refresh(); }
    catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  };
  const changeServiceTier = async (value) => {
    // Invalidate polls captured before this write, then any started during it.
    statusGeneration.current++;
    setBusy(true); setNotice("");
    try {
      const result = await request(`service-tier?value=${encodeURIComponent(value)}`, "POST");
      setState((current) => ({ ...current, serviceTier: result.serviceTier }));
      setNotice(`Default service tier saved: ${result.serviceTier === "fast" ? "Fast" : "Standard"} (requested).`);
      notifyServiceTierChange();
    } catch (error) { setNotice(error.message); }
    finally { statusGeneration.current++; setBusy(false); }
  };
  const signedIn = state.authenticated && state.planUsage;
  useEffect(() => {
    if (!signedIn) return undefined;
    const timer = setInterval(refresh, 30_000);
    return () => clearInterval(timer);
  }, [signedIn, refresh]);
  const signingIn = state.status === "signing-in";
  const quotaSigningIn = state.status === "quota-signing-in";
  const label = signingIn ? "Waiting for browser sign-in…" : signedIn ? `Signed in${state.label ? `: ${state.label}` : ""}`
    : state.status === "loading" ? "Checking sign-in status…" : state.authenticated ? "Signed in; ChatGPT plan usage is not authorized" : "Signed out";
  return h("section", { style: { display: "flex", flexDirection: "column", gap: 12, maxWidth: 640 } },
    h("h2", { style: { margin: 0 } }, "OpenAI Codex"),
    h("p", { style: { margin: 0 } }, "Use your ChatGPT plan without an OpenAI API key. Models are provided by the active account."),
    h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: 16, border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 10 } },
      h("span", null, label),
      state.status === "loading" ? null : h("button", { type: "button", disabled: busy || quotaSigningIn, onClick: signedIn || signingIn ? signOut : () => signIn() }, signedIn ? "Sign out" : signingIn ? "Cancel sign-in" : "Continue with ChatGPT")),
    state.accounts?.length ? h("div", { style: { display: "flex", gap: 8 } },
      h("select", { "aria-label": "ChatGPT account", disabled: busy || signingIn || quotaSigningIn, value: state.accounts.find((account) => account.active)?.clientId ?? "", onChange: (event) => selectAccount(event.target.value) },
        ...state.accounts.map((account) => h("option", { key: account.clientId, value: account.clientId }, `${account.label}${account.authenticated ? "" : " (signed out)"}`))),
      h("button", { type: "button", disabled: busy || signingIn || quotaSigningIn, onClick: () => signIn(true) }, "Add account")) : null,
    state.authenticated && !state.planUsage && !signingIn ? h("button", { type: "button", disabled: busy, onClick: signOut }, "Sign out") : null,
    signedIn && !signingIn ? h("div", { style: { display: "flex", alignItems: "center", gap: 12 } },
      h("span", null, "Using ChatGPT plan"),
      h("a", { href: "https://chatgpt.com/settings/usage", target: "_blank", rel: "noopener noreferrer" }, "Manage usage"),
      h("button", { type: "button", disabled: busy, onClick: refreshModels }, "Refresh models")) : null,
    h(ServiceTierControl, { value: state.serviceTier ?? "default", writable: state.serviceTierWritable === true,
      disabled: busy || signingIn || quotaSigningIn || state.status === "loading", onChange: changeServiceTier }),
    signedIn ? h(QuotaPanel, { quota: state.quota }) : null,
    signedIn ? h("div", { style: { display: "flex", gap: 8 } },
      quotaSigningIn && state.challenge ? h("button", { type: "button", disabled: busy, onClick: () => {
        const popup = window.open("about:blank", "_blank");
        if (!popup) { setNotice("Allow pop-ups to complete quota authorization."); return; }
        popup.opener = null; authorization.current = { popup, url: null }; openChallenge(state.challenge, popup);
      } }, "Continue quota authorization") : null,
      h("button", { type: "button", disabled: busy || signingIn, onClick: quotaSigningIn ? disconnectQuota : connectQuota }, quotaSigningIn ? "Cancel quota sign-in" : state.quotaAuth?.authenticated ? "Reconnect quota" : "Connect quota"),
      state.quotaAuth?.authenticated && !quotaSigningIn ? h("button", { type: "button", disabled: busy || signingIn, onClick: disconnectQuota }, "Disconnect quota") : null) : null,
    state.message ? h("p", { style: { color: state.status === "error" ? "var(--dsw-alias-state-error-primary)" : undefined } }, state.message) : null,
    notice ? h("p", { role: "status" }, notice) : null,
  );
}
export const name = "dsh-codex-oauth-client";
export const inject = ["slots", "locale"];
export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(SESSION_TIER_LOCALE, sessionTierMessages), "codex: session tier dictionaries");
  ctx.slots.inject("settings.section", () => ctx.slots.register({ name: "settings.section", id: "dsh-codex-oauth", order: 15, label: () => "OpenAI Codex" }, CodexSettings));
  ctx.inject(["slots", "sessions", "modelDirectories"], (scope) => {
    scope.slots.inject("conversation.input.right", () => scope.slots.register({
      name: "conversation.input.right", id: "dsh-codex-session-service-tier", order: 40, locale: SESSION_TIER_LOCALE,
      inject: (sessionId) => {
        const available = typeof sessionId === "string" && scope.sessions.binding(sessionId) !== undefined
          && scope.sessions.subagentAddress(sessionId) === undefined;
        const directory = available ? scope.modelDirectories.directoryFor(sessionId) : undefined;
        return { sessionId, available, directory: directory?.store, loadModel: () => directory?.load(), request: requestSessionTier };
      },
    }, SessionServiceTierControl));
  });
}
