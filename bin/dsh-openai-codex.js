#!/usr/bin/env node
import { spawn } from "node:child_process";
import { accounts, authPath, logout, status } from "../lib/auth.js";
import { loginWithQuota } from "../lib/login-flow.js";
import { CodexCredentialStore } from "../lib/store.js";
import { safeMessage } from "../lib/safe-message.js";
import { CompanionCredentialStore, companionPath, companionStatus, loginCompanion, prepareCompanionLogin } from "../lib/companion-auth.js";

function openBrowser(raw) {
  const url = new URL(raw);
  if (url.origin !== "https://auth.openai.com") throw new Error("Refusing to open an unexpected OAuth URL");
  const command = process.platform === "darwin" ? ["open", url.href] : process.platform === "win32" ? ["rundll32.exe", "url.dll,FileProtocolHandler", url.href] : ["xdg-open", url.href];
  const child = spawn(command[0], command.slice(1), { detached: true, stdio: "ignore", windowsHide: true });
  child.on("error", () => {}); child.unref();
}
function help() {
  console.log("Usage: dsh-openai-codex login [--new-account]\n       dsh-openai-codex <logout|status|accounts>\n       dsh-openai-codex use <client-id>\n       dsh-openai-codex models [--refresh]\n       dsh-openai-codex <quota-login|quota-status|quota-logout>");
}
const [action, ...flags] = process.argv.slice(2);
if (!action || action === "--help" || action === "-h") { help(); process.exit(0); }
if (flags.includes("--device-code")) {
  console.error("ChatGPT plan OAuth requires browser authorization with a local callback; --device-code is unavailable. Run login on your local computer.");
  process.exit(1);
}
const valid = action === "login" ? flags.length <= 1 && (!flags.length || flags[0] === "--new-account")
  : action === "models" ? flags.length <= 1 && (!flags.length || flags[0] === "--refresh")
  : action === "use" ? flags.length === 1 && !flags[0].startsWith("-")
  : ["logout", "status", "accounts", "quota-login", "quota-status", "quota-logout"].includes(action) && !flags.length;
if (!valid) { help(); process.exit(1); }
const store = new CodexCredentialStore();
const companion = new CompanionCredentialStore(companionPath(store.filename));
try {
  if (action === "quota-status") {
    const value = await companionStatus(companion);
    console.log(value.authenticated ? `Codex quota connected; credentials refresh automatically. Expires: ${value.expiresAt.toISOString()}` : "Codex quota disconnected; run dsh-openai-codex quota-login");
  } else if (action === "quota-logout") {
    await companion.disconnect(); console.log("Codex quota disconnected");
  } else if (action === "status") {
    const value = await status(store);
    if (!value.authenticated) { console.log("OpenAI Codex for dsh: signed out; run login to authorize ChatGPT plan usage"); process.exitCode = 1; }
    else console.log(`OpenAI Codex for dsh: signed in as ${value.label}; ChatGPT plan usage ${value.planUsage ? "enabled" : "not authorized"}; refresh is automatic`);
  } else if (action === "logout") {
    const result = await logout(store);
    console.log("OpenAI Codex for dsh: signed out; account registration retained for later sign-in");
    if (!result.remoteRevoked) console.log("Remote session revocation could not be confirmed. You can disconnect the app at https://chatgpt.com/settings/usage");
  } else if (action === "accounts") {
    const list = await accounts(store);
    for (const account of list) console.log(`${account.active ? "*" : " "} ${account.clientId}\t${account.label}\t${account.authenticated ? "signed in" : "signed out"}`);
    if (!list.length) console.log("No saved ChatGPT account registrations");
  } else if (action === "use") {
    await store.select(flags[0]);
    console.log("Selected ChatGPT account registration");
  } else if (action === "models") {
    const { createCodexAdapter } = await import("../lib/adapter.js");
    const adapter = createCodexAdapter(store);
    try {
      for (const model of await adapter.listModels("openai-codex", { refresh: flags.includes("--refresh") })) console.log(`${model.id}\t${model.name}`);
    } finally { adapter.dispose(); }
  } else {
    const controller = new AbortController();
    const cancel = () => controller.abort(new Error("Sign-in cancelled"));
    process.once("SIGINT", cancel);
    try {
      const interaction = {
        signal: controller.signal,
        notify: (event) => {
          if (event.type === "login_stage") { console.log("ChatGPT signed in. Connecting Codex quota…"); return; }
          if (event.type !== "auth_url") return;
          const display = new URL(event.url);
          display.searchParams.delete("id_token_hint");
          console.log(`Open this URL to sign in:\n${display.href}`);
          openBrowser(event.url);
        },
      };
      if (action === "quota-login") {
        await loginCompanion(companion, interaction, await prepareCompanionLogin(store));
        console.log("Codex quota connected; credentials refresh automatically");
      } else {
        const value = await loginWithQuota(store, companion, interaction, { newAccount: flags.includes("--new-account") });
        console.log(`OpenAI Codex for dsh: signed in; credentials saved to ${authPath()}`);
        console.log(value.planUsage ? "Eligible requests use your ChatGPT plan. Manage usage: https://chatgpt.com/settings/usage" : "ChatGPT plan usage was not authorized. Run login again to enable it.");
        if (value.quotaLogin.connected) console.log("Codex quota connected; credentials refresh automatically");
        else if (!value.quotaLogin.skipped) console.log(value.quotaLogin.cancelled ? "Quota authorization cancelled. ChatGPT sign-in is saved." : `ChatGPT sign-in is saved; quota unavailable: ${value.quotaLogin.message}. Retry with quota-login.`);
      }
    } finally { process.removeListener("SIGINT", cancel); }
  }
} catch (error) {
  console.error(`dsh-openai-codex: ${safeMessage(error)}`);
  process.exitCode = 1;
}
