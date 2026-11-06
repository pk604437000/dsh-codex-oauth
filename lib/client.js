window.__ModuleLoader__.load({id:"dsh-codex-oauth",factory:(require)=>{var module={exports:{}};var exports=module.exports;
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// client/index.jsx
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(index_exports);
var import_react3 = __toESM(require("react"), 1);

// client/service-tier.jsx
var import_react = __toESM(require("react"), 1);
var h = import_react.default.createElement;
function ServiceTierControl({ value = "default", disabled = false, writable = false, onChange }) {
  return h(
    "div",
    { style: { display: "flex", flexDirection: "column", gap: 6 } },
    h(
      "label",
      { style: { display: "flex", alignItems: "center", gap: 12 } },
      h("span", null, "Default service tier"),
      h(
        "select",
        {
          "aria-label": "Service tier",
          value,
          disabled: disabled || !writable,
          onChange: (event) => onChange(event.target.value)
        },
        h("option", { value: "default" }, "Standard"),
        h("option", { value: "fast" }, "Fast")
      )
    ),
    h("small", null, "Fast requests use more plan allowance or credits. Reasoning effort is unchanged."),
    h("small", null, "Requested service tier only; availability depends on your account and model."),
    !writable ? h("small", null, "Persistent settings are unavailable; edit the profile configuration.") : null
  );
}

// client/session-service-tier.jsx
var import_react2 = __toESM(require("react"), 1);
var h2 = import_react2.default.createElement;
var BASE = "/plugins/dsh-codex-oauth/auth/session-service-tier";
var SESSION_TIER_LOCALE = "codex-session-tier";
var SERVICE_TIER_EVENT = "dsh-codex-service-tier-changed";
var sessionTierMessages = {
  en: { label: "Service tier", aria: "Session service tier", inherit: "Inherit default", standard: "Standard", fast: "Fast", loading: "loading", requested: "Requested tier for this conversation only. Fast requests priority and may use more allowance; the server may return Standard.", unavailable: "Persistent session settings are unavailable." },
  zh: { label: "\u670D\u52A1\u6863\u4F4D", aria: "\u4F1A\u8BDD\u670D\u52A1\u6863\u4F4D", inherit: "\u7EE7\u627F\u9ED8\u8BA4", standard: "Standard", fast: "Fast", loading: "\u8BFB\u53D6\u4E2D", requested: "\u4EC5\u8BBE\u7F6E\u672C\u4F1A\u8BDD\u8BF7\u6C42\u7684\u6863\u4F4D\u3002Fast \u8BF7\u6C42 priority\uFF0C\u53EF\u80FD\u589E\u52A0\u989D\u5EA6\u6D88\u8017\uFF1B\u670D\u52A1\u7AEF\u4ECD\u53EF\u80FD\u8FD4\u56DE Standard\u3002", unavailable: "\u5F53\u524D\u4F1A\u8BDD\u8BBE\u7F6E\u6682\u4E0D\u53EF\u6301\u4E45\u5316\u3002" }
};
function notifyServiceTierChange(sessionId) {
  window.dispatchEvent(new window.CustomEvent(SERVICE_TIER_EVENT, { detail: { sessionId } }));
}
function snapshot(value, sessionId) {
  if (value?.sessionId !== sessionId || !["inherit", "default", "fast"].includes(value.selection) || !["default", "fast"].includes(value.effectiveTier) || !["default", "fast"].includes(value.defaultTier) || typeof value.writable !== "boolean") throw new Error("Invalid session settings response");
  return value;
}
async function requestSessionTier(sessionId, value, signal) {
  const query = `session_id=${encodeURIComponent(sessionId)}${value === void 0 ? "" : `&value=${encodeURIComponent(value)}`}`;
  const response = await fetch(`${BASE}?${query}`, { method: value === void 0 ? "GET" : "POST", signal, credentials: "same-origin", headers: { accept: "application/json" } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : `HTTP ${response.status}`);
  const state = snapshot(data, sessionId);
  if (value !== void 0) notifyServiceTierChange(sessionId);
  return state;
}
var EMPTY_DIRECTORY = { current: null };
var english = (key) => sessionTierMessages.en[key] ?? key;
function SessionTierInstance({ sessionId, directory, loadModel, available = false, request: request2 = requestSessionTier, t = english }) {
  const model = (0, import_react2.useSyncExternalStore)((notify) => directory?.subscribe(notify) ?? (() => {
  }), () => directory?.getSnapshot() ?? EMPTY_DIRECTORY);
  const codex = model.current?.provider === "openai-codex";
  const ready = available && typeof sessionId === "string" && sessionId.length > 0 && codex;
  const [state, setState] = (0, import_react2.useState)({ snapshot: null, error: "", busy: false });
  const sequence = (0, import_react2.useRef)(0), alive = (0, import_react2.useRef)(false), saving = (0, import_react2.useRef)(false), reads = (0, import_react2.useRef)(/* @__PURE__ */ new Set());
  const current = (generation) => alive.current && generation === sequence.current;
  (0, import_react2.useEffect)(() => {
    if (available && sessionId) Promise.resolve(loadModel?.()).catch(() => {
    });
  }, [available, sessionId, loadModel]);
  const refresh = (0, import_react2.useCallback)(() => {
    if (!ready || saving.current) return Promise.resolve();
    const generation = ++sequence.current;
    const controller = new AbortController();
    reads.current.add(controller);
    return request2(sessionId, void 0, controller.signal).then((value2) => {
      const next = snapshot(value2, sessionId);
      if (current(generation)) setState({ snapshot: next, error: "", busy: false });
    }).catch((error) => {
      if (current(generation) && !controller.signal.aborted) setState((previous) => ({ ...previous, error: error.message }));
    }).finally(() => reads.current.delete(controller));
  }, [ready, sessionId, request2]);
  (0, import_react2.useEffect)(() => {
    alive.current = true;
    setState((previous) => ({ ...previous, busy: false }));
    if (ready) refresh();
    const timer = ready ? setInterval(refresh, 3e4) : void 0;
    const changed = (event) => {
      if (!event.detail?.sessionId || event.detail.sessionId === sessionId) refresh();
    };
    if (ready) window.addEventListener(SERVICE_TIER_EVENT, changed);
    return () => {
      alive.current = false;
      saving.current = false;
      sequence.current++;
      for (const controller of reads.current) controller.abort();
      reads.current.clear();
      if (timer !== void 0) clearInterval(timer);
      window.removeEventListener(SERVICE_TIER_EVENT, changed);
    };
  }, [ready, refresh, sessionId]);
  const change = async (value2) => {
    if (!ready || !state.snapshot?.writable || saving.current) return;
    const generation = ++sequence.current;
    saving.current = true;
    setState((previous) => ({ ...previous, busy: true, error: "" }));
    try {
      const next = snapshot(await request2(sessionId, value2), sessionId);
      if (current(generation)) setState({ snapshot: next, error: "", busy: true });
    } catch (error) {
      if (current(generation)) setState((previous) => ({ ...previous, error: error.message }));
    } finally {
      if (current(generation)) {
        saving.current = false;
        setState((previous) => ({ ...previous, busy: false }));
      }
    }
  };
  if (!ready) return null;
  const value = state.snapshot;
  const inherited = value ? t(value.defaultTier === "fast" ? "fast" : "standard") : t("loading");
  return h2(
    "span",
    { style: { display: "inline-flex", flexDirection: "column", gap: 3, maxWidth: 280, fontSize: 12 } },
    h2(
      "label",
      { title: value?.writable === false ? t("unavailable") : t("requested"), style: { display: "inline-flex", alignItems: "center", gap: 6 } },
      h2("span", null, t("label")),
      h2(
        "select",
        {
          "aria-label": t("aria"),
          value: value?.selection ?? "inherit",
          disabled: !value?.writable || state.busy,
          style: { maxWidth: 180, font: "inherit", color: "inherit", background: "var(--dsw-alias-bg-base, transparent)", border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 6, padding: "3px 5px" },
          onChange: (event) => change(event.target.value)
        },
        h2("option", { value: "inherit" }, `${t("inherit")} (${inherited})`),
        h2("option", { value: "default" }, t("standard")),
        h2("option", { value: "fast" }, t("fast"))
      )
    ),
    state.error ? h2("span", { role: "status", style: { color: "var(--dsw-alias-state-error-primary)", overflowWrap: "anywhere" } }, state.error) : null
  );
}
function SessionServiceTierControl(props) {
  return h2(SessionTierInstance, { ...props, key: props.sessionId ?? "unbound" });
}

// client/index.jsx
var BASE2 = "/plugins/dsh-codex-oauth/auth";
var h3 = import_react3.default.createElement;
async function request(path, method = "GET") {
  const response = await fetch(`${BASE2}/${path}`, { method, credentials: "same-origin", headers: { accept: "application/json" } });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof value.error === "string" ? value.error : `HTTP ${response.status}`);
  return value;
}
function QuotaPanel({ quota }) {
  if (!quota?.available) return h3("div", { role: "status" }, "Quota unavailable. No current quota data is available.");
  return h3(
    "div",
    { style: { display: "flex", flexDirection: "column", gap: 12 } },
    ...quota.buckets.map((bucket) => h3(
      "section",
      { key: bucket.id },
      h3("strong", null, bucket.name ?? bucket.id),
      ...bucket.windows.map((window2, index) => {
        const remaining = Math.round(window2.remainingPercent);
        const color = window2.stale ? "#888" : remaining <= 10 ? "#c44" : remaining <= 30 ? "#b88020" : "#38875c";
        return h3(
          "div",
          { key: index, style: { marginTop: 8 } },
          h3("div", null, `${window2.label}: ${remaining}% remaining${window2.stale ? " (stale)" : ""}`),
          h3(
            "div",
            {
              role: "progressbar",
              "aria-label": `${window2.label} quota remaining`,
              "aria-valuemin": 0,
              "aria-valuemax": 100,
              "aria-valuenow": window2.remainingPercent,
              style: { height: 7, background: "var(--dsw-alias-border-l2)", borderRadius: 4, marginTop: 4 }
            },
            h3("div", { style: { width: `${window2.remainingPercent}%`, height: "100%", background: color, borderRadius: 4 } })
          ),
          h3("small", null, window2.resetsAt ? `Reset: ${new Date(window2.resetsAt * 1e3).toLocaleString("en-US")}` : "Reset time unavailable"),
          h3("small", { style: { display: "block" } }, `Updated: ${new Date(window2.checkedAt).toLocaleString("en-US")}`)
        );
      })
    )),
    h3("small", null, "Quota checks do not call a model.")
  );
}
function CodexSettings() {
  const [state, setState] = (0, import_react3.useState)({ status: "loading" });
  const [busy, setBusy] = (0, import_react3.useState)(false);
  const [notice, setNotice] = (0, import_react3.useState)("");
  const authorization = (0, import_react3.useRef)({ popup: null, url: null });
  const statusGeneration = (0, import_react3.useRef)(0);
  const openChallenge = (challenge, popup = authorization.current.popup) => {
    if (!popup || popup.closed) return;
    if (authorization.current.url === challenge.url) return;
    popup.location.replace(challenge.url);
    authorization.current = { popup, url: challenge.url };
  };
  (0, import_react3.useEffect)(() => {
    if (state.challenge) openChallenge(state.challenge);
  }, [state.challenge?.url]);
  const refresh = (0, import_react3.useCallback)(() => {
    const generation = ++statusGeneration.current;
    return request("status").then((value) => {
      if (generation === statusGeneration.current) setState(value);
    }).catch((error) => {
      if (generation === statusGeneration.current) setState((current) => ({ ...current, status: "error", message: error.message }));
    });
  }, []);
  (0, import_react3.useEffect)(() => {
    refresh();
  }, [refresh]);
  (0, import_react3.useEffect)(() => {
    if (!["signing-in", "quota-signing-in"].includes(state.status)) return void 0;
    const timer = setInterval(refresh, 1e3);
    return () => clearInterval(timer);
  }, [refresh, state.status]);
  const signIn = async (newAccount = false) => {
    const popup = window.open("about:blank", "_blank");
    if (!popup) {
      setState({ ...state, status: "error", message: "Allow pop-ups to complete sign-in." });
      return;
    }
    popup.opener = null;
    authorization.current = { popup, url: null };
    setBusy(true);
    setState({ ...state, status: "signing-in" });
    setNotice("");
    try {
      const challenge = await request(`login${newAccount ? "?new_account=1" : ""}`, "POST");
      openChallenge(challenge, popup);
    } catch (error) {
      popup.close();
      setState({ ...state, status: "error", message: error.message });
    } finally {
      setBusy(false);
    }
  };
  const signOut = async () => {
    setBusy(true);
    try {
      const result = await request("logout", "POST");
      if (!result.remoteRevoked) setNotice("Signed out locally. Remote revocation was not confirmed; disconnect the app in ChatGPT usage settings.");
      await refresh();
    } catch (error) {
      setState({ ...state, status: "error", message: error.message });
    } finally {
      setBusy(false);
    }
  };
  const selectAccount = async (clientId) => {
    setBusy(true);
    setNotice("");
    try {
      setState(await request(`account?client_id=${encodeURIComponent(clientId)}`, "POST"));
    } catch (error) {
      setState({ ...state, status: "error", message: error.message });
    } finally {
      setBusy(false);
    }
  };
  const refreshModels = async () => {
    setBusy(true);
    try {
      const { models } = await request("models", "POST");
      setNotice(`Refreshed ${models.length} available models.`);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  };
  const connectQuota = async () => {
    const popup = window.open("about:blank", "_blank");
    if (!popup) {
      setNotice("Allow pop-ups to connect quota.");
      return;
    }
    popup.opener = null;
    setBusy(true);
    setNotice("");
    authorization.current = { popup, url: null };
    try {
      const challenge = await request("quota/login", "POST");
      openChallenge(challenge, popup);
      await refresh();
    } catch (error) {
      popup.close();
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  };
  const disconnectQuota = async () => {
    setBusy(true);
    try {
      await request("quota/logout", "POST");
      await refresh();
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  };
  const changeServiceTier = async (value) => {
    statusGeneration.current++;
    setBusy(true);
    setNotice("");
    try {
      const result = await request(`service-tier?value=${encodeURIComponent(value)}`, "POST");
      setState((current) => ({ ...current, serviceTier: result.serviceTier }));
      setNotice(`Default service tier saved: ${result.serviceTier === "fast" ? "Fast" : "Standard"} (requested).`);
      notifyServiceTierChange();
    } catch (error) {
      setNotice(error.message);
    } finally {
      statusGeneration.current++;
      setBusy(false);
    }
  };
  const signedIn = state.authenticated && state.planUsage;
  (0, import_react3.useEffect)(() => {
    if (!signedIn) return void 0;
    const timer = setInterval(refresh, 3e4);
    return () => clearInterval(timer);
  }, [signedIn, refresh]);
  const signingIn = state.status === "signing-in";
  const quotaSigningIn = state.status === "quota-signing-in";
  const label = signingIn ? "Waiting for browser sign-in\u2026" : signedIn ? `Signed in${state.label ? `: ${state.label}` : ""}` : state.status === "loading" ? "Checking sign-in status\u2026" : state.authenticated ? "Signed in; ChatGPT plan usage is not authorized" : "Signed out";
  return h3(
    "section",
    { style: { display: "flex", flexDirection: "column", gap: 12, maxWidth: 640 } },
    h3("h2", { style: { margin: 0 } }, "OpenAI Codex"),
    h3("p", { style: { margin: 0 } }, "Use your ChatGPT plan without an OpenAI API key. Models are provided by the active account."),
    h3(
      "div",
      { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: 16, border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 10 } },
      h3("span", null, label),
      state.status === "loading" ? null : h3("button", { type: "button", disabled: busy || quotaSigningIn, onClick: signedIn || signingIn ? signOut : () => signIn() }, signedIn ? "Sign out" : signingIn ? "Cancel sign-in" : "Continue with ChatGPT")
    ),
    state.accounts?.length ? h3(
      "div",
      { style: { display: "flex", gap: 8 } },
      h3(
        "select",
        { "aria-label": "ChatGPT account", disabled: busy || signingIn || quotaSigningIn, value: state.accounts.find((account) => account.active)?.clientId ?? "", onChange: (event) => selectAccount(event.target.value) },
        ...state.accounts.map((account) => h3("option", { key: account.clientId, value: account.clientId }, `${account.label}${account.authenticated ? "" : " (signed out)"}`))
      ),
      h3("button", { type: "button", disabled: busy || signingIn || quotaSigningIn, onClick: () => signIn(true) }, "Add account")
    ) : null,
    state.authenticated && !state.planUsage && !signingIn ? h3("button", { type: "button", disabled: busy, onClick: signOut }, "Sign out") : null,
    signedIn && !signingIn ? h3(
      "div",
      { style: { display: "flex", alignItems: "center", gap: 12 } },
      h3("span", null, "Using ChatGPT plan"),
      h3("a", { href: "https://chatgpt.com/settings/usage", target: "_blank", rel: "noopener noreferrer" }, "Manage usage"),
      h3("button", { type: "button", disabled: busy, onClick: refreshModels }, "Refresh models")
    ) : null,
    h3(ServiceTierControl, {
      value: state.serviceTier ?? "default",
      writable: state.serviceTierWritable === true,
      disabled: busy || signingIn || quotaSigningIn || state.status === "loading",
      onChange: changeServiceTier
    }),
    signedIn ? h3(QuotaPanel, { quota: state.quota }) : null,
    signedIn ? h3(
      "div",
      { style: { display: "flex", gap: 8 } },
      quotaSigningIn && state.challenge ? h3("button", { type: "button", disabled: busy, onClick: () => {
        const popup = window.open("about:blank", "_blank");
        if (!popup) {
          setNotice("Allow pop-ups to complete quota authorization.");
          return;
        }
        popup.opener = null;
        authorization.current = { popup, url: null };
        openChallenge(state.challenge, popup);
      } }, "Continue quota authorization") : null,
      h3("button", { type: "button", disabled: busy || signingIn, onClick: quotaSigningIn ? disconnectQuota : connectQuota }, quotaSigningIn ? "Cancel quota sign-in" : state.quotaAuth?.authenticated ? "Reconnect quota" : "Connect quota"),
      state.quotaAuth?.authenticated && !quotaSigningIn ? h3("button", { type: "button", disabled: busy || signingIn, onClick: disconnectQuota }, "Disconnect quota") : null
    ) : null,
    state.message ? h3("p", { style: { color: state.status === "error" ? "var(--dsw-alias-state-error-primary)" : void 0 } }, state.message) : null,
    notice ? h3("p", { role: "status" }, notice) : null
  );
}
var name = "dsh-codex-oauth-client";
var inject = ["slots", "locale"];
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(SESSION_TIER_LOCALE, sessionTierMessages), "codex: session tier dictionaries");
  ctx.slots.inject("settings.section", () => ctx.slots.register({ name: "settings.section", id: "dsh-codex-oauth", order: 15, label: () => "OpenAI Codex" }, CodexSettings));
  ctx.inject(["slots", "sessions", "modelDirectories"], (scope) => {
    scope.slots.inject("conversation.input.right", () => scope.slots.register({
      name: "conversation.input.right",
      id: "dsh-codex-session-service-tier",
      order: 40,
      locale: SESSION_TIER_LOCALE,
      inject: (sessionId) => {
        const available = typeof sessionId === "string" && scope.sessions.binding(sessionId) !== void 0 && scope.sessions.subagentAddress(sessionId) === void 0;
        const directory = available ? scope.modelDirectories.directoryFor(sessionId) : void 0;
        return { sessionId, available, directory: directory?.store, loadModel: () => directory?.load(), request: requestSessionTier };
      }
    }, SessionServiceTierControl));
  });
}
return module.exports;}});
