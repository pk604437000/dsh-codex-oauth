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
var import_react2 = __toESM(require("react"), 1);

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
      h("span", null, "Service tier"),
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

// client/index.jsx
var BASE = "/plugins/dsh-codex-oauth/auth";
var h2 = import_react2.default.createElement;
async function request(path, method = "GET") {
  const response = await fetch(`${BASE}/${path}`, { method, credentials: "same-origin", headers: { accept: "application/json" } });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof value.error === "string" ? value.error : `HTTP ${response.status}`);
  return value;
}
function QuotaPanel({ quota }) {
  if (!quota?.available) return h2("div", { role: "status" }, "Quota unavailable. No current quota data is available.");
  return h2(
    "div",
    { style: { display: "flex", flexDirection: "column", gap: 12 } },
    ...quota.buckets.map((bucket) => h2(
      "section",
      { key: bucket.id },
      h2("strong", null, bucket.name ?? bucket.id),
      ...bucket.windows.map((window2, index) => {
        const remaining = Math.round(window2.remainingPercent);
        const color = window2.stale ? "#888" : remaining <= 10 ? "#c44" : remaining <= 30 ? "#b88020" : "#38875c";
        return h2(
          "div",
          { key: index, style: { marginTop: 8 } },
          h2("div", null, `${window2.label}: ${remaining}% remaining${window2.stale ? " (stale)" : ""}`),
          h2(
            "div",
            {
              role: "progressbar",
              "aria-label": `${window2.label} quota remaining`,
              "aria-valuemin": 0,
              "aria-valuemax": 100,
              "aria-valuenow": window2.remainingPercent,
              style: { height: 7, background: "var(--dsw-alias-border-l2)", borderRadius: 4, marginTop: 4 }
            },
            h2("div", { style: { width: `${window2.remainingPercent}%`, height: "100%", background: color, borderRadius: 4 } })
          ),
          h2("small", null, window2.resetsAt ? `Reset: ${new Date(window2.resetsAt * 1e3).toLocaleString("en-US")}` : "Reset time unavailable"),
          h2("small", { style: { display: "block" } }, `Updated: ${new Date(window2.checkedAt).toLocaleString("en-US")}`)
        );
      })
    )),
    h2("small", null, "Quota checks do not call a model.")
  );
}
function CodexSettings() {
  const [state, setState] = (0, import_react2.useState)({ status: "loading" });
  const [busy, setBusy] = (0, import_react2.useState)(false);
  const [notice, setNotice] = (0, import_react2.useState)("");
  const authorization = (0, import_react2.useRef)({ popup: null, url: null });
  const statusGeneration = (0, import_react2.useRef)(0);
  const openChallenge = (challenge, popup = authorization.current.popup) => {
    if (!popup || popup.closed) return;
    if (authorization.current.url === challenge.url) return;
    popup.location.replace(challenge.url);
    authorization.current = { popup, url: challenge.url };
  };
  (0, import_react2.useEffect)(() => {
    if (state.challenge) openChallenge(state.challenge);
  }, [state.challenge?.url]);
  const refresh = (0, import_react2.useCallback)(() => {
    const generation = ++statusGeneration.current;
    return request("status").then((value) => {
      if (generation === statusGeneration.current) setState(value);
    }).catch((error) => {
      if (generation === statusGeneration.current) setState((current) => ({ ...current, status: "error", message: error.message }));
    });
  }, []);
  (0, import_react2.useEffect)(() => {
    refresh();
  }, [refresh]);
  (0, import_react2.useEffect)(() => {
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
      setNotice(`Service tier saved: ${result.serviceTier === "fast" ? "Fast" : "Standard"} (requested).`);
    } catch (error) {
      setNotice(error.message);
    } finally {
      statusGeneration.current++;
      setBusy(false);
    }
  };
  const signedIn = state.authenticated && state.planUsage;
  (0, import_react2.useEffect)(() => {
    if (!signedIn) return void 0;
    const timer = setInterval(refresh, 3e4);
    return () => clearInterval(timer);
  }, [signedIn, refresh]);
  const signingIn = state.status === "signing-in";
  const quotaSigningIn = state.status === "quota-signing-in";
  const label = signingIn ? "Waiting for browser sign-in\u2026" : signedIn ? `Signed in${state.label ? `: ${state.label}` : ""}` : state.status === "loading" ? "Checking sign-in status\u2026" : state.authenticated ? "Signed in; ChatGPT plan usage is not authorized" : "Signed out";
  return h2(
    "section",
    { style: { display: "flex", flexDirection: "column", gap: 12, maxWidth: 640 } },
    h2("h2", { style: { margin: 0 } }, "OpenAI Codex"),
    h2("p", { style: { margin: 0 } }, "Use your ChatGPT plan without an OpenAI API key. Models are provided by the active account."),
    h2(
      "div",
      { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: 16, border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 10 } },
      h2("span", null, label),
      state.status === "loading" ? null : h2("button", { type: "button", disabled: busy || quotaSigningIn, onClick: signedIn || signingIn ? signOut : () => signIn() }, signedIn ? "Sign out" : signingIn ? "Cancel sign-in" : "Continue with ChatGPT")
    ),
    state.accounts?.length ? h2(
      "div",
      { style: { display: "flex", gap: 8 } },
      h2(
        "select",
        { "aria-label": "ChatGPT account", disabled: busy || signingIn || quotaSigningIn, value: state.accounts.find((account) => account.active)?.clientId ?? "", onChange: (event) => selectAccount(event.target.value) },
        ...state.accounts.map((account) => h2("option", { key: account.clientId, value: account.clientId }, `${account.label}${account.authenticated ? "" : " (signed out)"}`))
      ),
      h2("button", { type: "button", disabled: busy || signingIn || quotaSigningIn, onClick: () => signIn(true) }, "Add account")
    ) : null,
    state.authenticated && !state.planUsage && !signingIn ? h2("button", { type: "button", disabled: busy, onClick: signOut }, "Sign out") : null,
    signedIn && !signingIn ? h2(
      "div",
      { style: { display: "flex", alignItems: "center", gap: 12 } },
      h2("span", null, "Using ChatGPT plan"),
      h2("a", { href: "https://chatgpt.com/settings/usage", target: "_blank", rel: "noopener noreferrer" }, "Manage usage"),
      h2("button", { type: "button", disabled: busy, onClick: refreshModels }, "Refresh models")
    ) : null,
    h2(ServiceTierControl, {
      value: state.serviceTier ?? "default",
      writable: state.serviceTierWritable === true,
      disabled: busy || signingIn || quotaSigningIn || state.status === "loading",
      onChange: changeServiceTier
    }),
    signedIn ? h2(QuotaPanel, { quota: state.quota }) : null,
    signedIn ? h2(
      "div",
      { style: { display: "flex", gap: 8 } },
      quotaSigningIn && state.challenge ? h2("button", { type: "button", disabled: busy, onClick: () => {
        const popup = window.open("about:blank", "_blank");
        if (!popup) {
          setNotice("Allow pop-ups to complete quota authorization.");
          return;
        }
        popup.opener = null;
        authorization.current = { popup, url: null };
        openChallenge(state.challenge, popup);
      } }, "Continue quota authorization") : null,
      h2("button", { type: "button", disabled: busy || signingIn, onClick: quotaSigningIn ? disconnectQuota : connectQuota }, quotaSigningIn ? "Cancel quota sign-in" : state.quotaAuth?.authenticated ? "Reconnect quota" : "Connect quota"),
      state.quotaAuth?.authenticated && !quotaSigningIn ? h2("button", { type: "button", disabled: busy || signingIn, onClick: disconnectQuota }, "Disconnect quota") : null
    ) : null,
    state.message ? h2("p", { style: { color: state.status === "error" ? "var(--dsw-alias-state-error-primary)" : void 0 } }, state.message) : null,
    notice ? h2("p", { role: "status" }, notice) : null
  );
}
var name = "dsh-codex-oauth-client";
var inject = ["slots"];
function apply(ctx) {
  ctx.slots.inject("settings.section", () => ctx.slots.register({ name: "settings.section", id: "dsh-codex-oauth", order: 15, label: () => "OpenAI Codex" }, CodexSettings));
}
return module.exports;}});
