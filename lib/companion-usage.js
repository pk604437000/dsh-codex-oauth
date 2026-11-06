const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
export async function readQuotaJSON(response) {
  if (!response.ok) {
    await response.body?.cancel();
    const error = new Error(`Quota query failed (HTTP ${response.status})`);
    error.status = response.status; throw error;
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Quota response is empty");
  const chunks = []; let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 65536) throw new Error("Quota response is too large");
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
// Complete-list matching is routing evidence, not cryptographic identity proof.
// Reject ambiguous registrations and pagination rather than displaying another
// account's Codex quota as the native app's shared plan (pi-usage 0.66 contract).
export function matchingRegistration(body, clientId) {
  if (!body || !Array.isArray(body.items) || body.items.length > 128
    || Object.keys(body).some((key) => !["items", "has_more", "next_cursor"].includes(key))
    || (body.has_more !== undefined && body.has_more !== false)
    || (body.next_cursor !== undefined && body.next_cursor !== null && body.next_cursor !== "")
    || body.items.some((app) => typeof app?.id !== "string" || !app.id.trim())
    || !clientId || body.items.filter((app) => app.id === clientId).length !== 1) {
    throw new Error("Codex quota login does not uniquely match this app. Connect the same ChatGPT account and workspace");
  }
  return body.items.find((app) => app.id === clientId);
}
export async function checkRegistration(credential, clientId, options = {}) {
  const response = await (options.fetch ?? globalThis.fetch)(`${USAGE_URL}/chatpass/apps`, {
    redirect: "error", signal: options.signal,
    headers: { authorization: `Bearer ${credential.access}`, "chatgpt-account-id": credential.accountId },
  });
  return matchingRegistration(await readQuotaJSON(response), clientId);
}
