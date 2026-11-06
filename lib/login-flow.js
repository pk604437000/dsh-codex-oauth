import { login } from "./auth.js";
import { getCompanionCredential, loginCompanion, prepareCompanionLogin } from "./companion-auth.js";
import { safeMessage } from "./safe-message.js";

// Quota uses a separate grant. Its failure must never undo a completed native login.
export async function finishQuotaLogin(nativeStore, companionStore, interaction, options = {}) {
  try {
    interaction.signal?.throwIfAborted();
    const prepared = await prepareCompanionLogin(nativeStore, options);
    const signal = AbortSignal.any([...(interaction.signal ? [interaction.signal] : []), AbortSignal.timeout(15_000)]);
    try {
      let credential = await getCompanionCredential(companionStore, { ...prepared, signal });
      try { await prepared.validateRegistration(credential, signal); }
      catch (error) {
        if (error.status !== 401) throw error;
        credential = await getCompanionCredential(companionStore, { ...prepared, signal, rejectedAccess: credential.access });
        await prepared.validateRegistration(credential, signal);
      }
      interaction.signal?.throwIfAborted();
      return { connected: true, reused: true };
    } catch {
      interaction.signal?.throwIfAborted();
      await prepared.assertNativeCurrent();
    }
    await loginCompanion(companionStore, interaction, prepared);
    return { connected: true, reused: false };
  } catch (error) {
    return interaction.signal?.aborted ? { connected: false, cancelled: true }
      : { connected: false, message: safeMessage(error) };
  }
}

export async function loginWithQuota(nativeStore, companionStore, interaction, options = {}) {
  const value = await login(nativeStore, interaction, options);
  if (!value.planUsage || !companionStore) return { ...value, quotaLogin: { connected: false, skipped: true } };
  interaction.notify?.({ type: "login_stage", stage: "quota", status: value });
  const quotaLogin = await finishQuotaLogin(nativeStore, companionStore, interaction, options);
  return { ...value, quotaLogin };
}
