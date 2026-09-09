import type {
  ExtensionAPI,
  ExtensionContext,
  ProviderConfig,
  ProviderModelConfig,
} from "@earendil-works/pi-coding-agent";
import type { Api, Model, RefreshModelsContext } from "@earendil-works/pi-ai";
import { registerApiProvider } from "@earendil-works/pi-ai/compat";
import {
  type AccountSlot,
  isAntigravityProviderId,
  listAccountSlots,
  providerDisplayName,
  resolveAccountRef,
  slotNumber,
} from "./accounts/index.js";
import { getApiKey, loginAntigravity, refreshAntigravityToken } from "./auth/index.js";
import { DEFAULT_ENDPOINT, endpointCandidates } from "./client/index.js";
import { getLastDiagnostics, runWithDiagnostics } from "./diagnostics/index.js";
import {
  ANTIGRAVITY_MODELS,
  applyDerivedModels,
  PROVIDER_ID,
  readCachedModelRows,
  writeCachedModelRows,
} from "./models/index.js";
import { ANTIGRAVITY_API, streamAntigravity } from "./stream/index.js";
import {
  fetchAccountUsage,
  fetchLiveModelRows,
  formatFooterStatus,
  formatModelsList,
  formatUsageSummary,
  resolveApiKeyFromContext,
} from "./usage/index.js";
import { maskEmail, prewarmConnection, redactSecrets } from "./utils/index.js";

/**
 * Pi's interactive `notify` writes into the chat transcript. `console.log` in that
 * mode prints to the raw terminal and paints over the TUI. Use one channel only.
 */
function emitCommandOutput(
  ctx: ExtensionContext,
  text: string,
  type: "info" | "warning" | "error" = "info",
): void {
  if (ctx.hasUI) {
    ctx.ui.notify(text, type);
    return;
  }
  if (type === "warning" || type === "error") console.error(text);
  else console.log(text);
}

/**
 * The account slot the session is currently talking to: the current model's
 * provider when it is one of ours, the primary slot otherwise.
 */
function activeProviderId(ctx: ExtensionContext): string {
  const current = ctx.model?.provider;
  return isAntigravityProviderId(current) ? (current as string) : PROVIDER_ID;
}

/** Short account tag for status lines: empty for the primary slot. */
function accountTag(providerId: string): string {
  const slot = listAccountSlots().find((entry) => entry.providerId === providerId);
  if (!slot || slot.slot === 1) return "";
  return `#${slot.slot}${slot.email ? ` ${slot.email.split("@")[0]}` : ""} `;
}

async function withUsage(
  ctx: ExtensionContext,
  fn: (usage: Awaited<ReturnType<typeof fetchAccountUsage>>) => string,
): Promise<void> {
  const providerId = activeProviderId(ctx);
  try {
    const apiKey = await resolveApiKeyFromContext(ctx, providerId);
    if (!apiKey) {
      emitCommandOutput(
        ctx,
        `No Antigravity credentials. Run /login ${providerId} first.`,
        "warning",
      );
      return;
    }
    if (ctx.hasUI) ctx.ui.notify("Fetching Antigravity usage…", "info");
    const usage = await runWithDiagnostics(() => fetchAccountUsage(apiKey));
    emitCommandOutput(ctx, fn(usage));
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    emitCommandOutput(ctx, `Antigravity usage failed: ${msg}`, "warning");
  }
}

const STATUS_KEY = "antigravity.quota";

/** Refresh quota and update footer status; swallows errors silently. */
async function refreshFooterUsage(ctx: ExtensionContext): Promise<void> {
  try {
    const providerId = ctx.model?.provider;
    if (!isAntigravityProviderId(providerId)) {
      if (ctx.hasUI) ctx.ui.setStatus(STATUS_KEY, undefined);
      return;
    }
    const apiKey = await ctx.modelRegistry
      .getApiKeyForProvider(providerId as string)
      .catch(() => undefined);
    if (!apiKey) {
      if (ctx.hasUI) ctx.ui.setStatus(STATUS_KEY, undefined);
      return;
    }
    const usage = await fetchAccountUsage(apiKey);
    // Quota is per account, so a model switch mid-flight invalidates this read.
    if (ctx.model?.provider !== providerId) {
      if (ctx.hasUI) ctx.ui.setStatus(STATUS_KEY, undefined);
      return;
    }
    const text = `${accountTag(providerId as string)}${formatFooterStatus(usage)}`;
    if (ctx.hasUI) ctx.ui.setStatus(STATUS_KEY, text);
  } catch {
    // silent — footer is best-effort
  }
}

/**
 * Live model catalog sync for one account slot: derive unknown model families
 * from the backend `fetchAvailableModels` catalog and return the full list to
 * register. Catalogs are per account (entitlement differs), so each slot reads
 * and writes its own cache file.
 *
 * Framework contract (pi-ai `Provider.refreshModels`): offline phases restore
 * the previously synced catalog from the local cache; the composer publishes
 * truthy return values and skips undefined (no-op). Successful rows persist to
 * the cache so derived models survive restarts and provider re-registration
 * (recompose clears the composer's in-memory list, offline restore refills it).
 *
 * Online failures THROW so the framework records them in the refresh result's
 * errors map (surfaced as a warning by /antigravity.models sync); the in-memory
 * list from the offline restore stays intact — pi-ai's "retain on failure".
 */
async function refreshLiveModels(
  providerId: string,
  context: RefreshModelsContext,
): Promise<ProviderModelConfig[]> {
  if (!context.credential) return undefined as unknown as ProviderModelConfig[];
  if (!context.allowNetwork) {
    const cached = readCachedModelRows(providerId);
    return cached ? applyDerivedModels(cached) : (undefined as unknown as ProviderModelConfig[]);
  }
  const credential = context.credential;
  const apiKey =
    credential.type === "oauth" ? getApiKey(credential) : (credential.key ?? undefined);
  if (!apiKey) return undefined as unknown as ProviderModelConfig[];
  const rows = await fetchLiveModelRows(apiKey);
  writeCachedModelRows(rows, providerId);
  return applyDerivedModels(rows);
}

async function refreshModelRegistry(ctx: ExtensionContext, providerIds: string[]): Promise<void> {
  if (providerIds.length === 0) return;
  try {
    const result = await ctx.modelRegistry.refresh({ providers: providerIds });
    for (const providerId of providerIds) {
      const error = result.errors.get(providerId);
      if (error) {
        emitCommandOutput(
          ctx,
          `Antigravity model sync failed for ${providerId}: ${redactSecrets(error.message)}`,
          "warning",
        );
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    emitCommandOutput(ctx, `Antigravity model sync failed: ${redactSecrets(msg)}`, "warning");
  }
}

/**
 * Models to register for a slot: its synced catalog when one was cached,
 * the static baseline otherwise.
 */
function slotModels(providerId: string): ProviderModelConfig[] {
  const cached = readCachedModelRows(providerId);
  return cached ? applyDerivedModels(cached) : ANTIGRAVITY_MODELS;
}

/**
 * Provider config for one account slot. Slots that have never signed in
 * register no models at all — they stay out of `/model` while remaining
 * available to `/login`, so raising ANTIGRAVITY_ACCOUNTS costs nothing until
 * the extra accounts are actually used.
 *
 * Re-registration merges defined values over the previous registration, so a
 * slot that gains models keeps them for the rest of the session.
 */
function slotProviderConfig(pi: ExtensionAPI, slot: AccountSlot): ProviderConfig {
  const displayName = providerDisplayName(slot.providerId, slot.email);
  return {
    name: displayName,
    baseUrl: DEFAULT_ENDPOINT,
    api: ANTIGRAVITY_API,
    ...(slot.signedIn ? { models: slotModels(slot.providerId) } : {}),
    refreshModels: (context: RefreshModelsContext) => refreshLiveModels(slot.providerId, context),
    oauth: {
      name: displayName,
      login: (callbacks) => loginSlot(pi, slot.providerId, callbacks),
      refreshToken: refreshAntigravityToken,
      getApiKey,
    },
    streamSimple: streamAntigravity,
  };
}

function registerSlot(pi: ExtensionAPI, slot: AccountSlot): void {
  pi.registerProvider(slot.providerId, slotProviderConfig(pi, slot));
}

/**
 * Sign in to one slot, then re-register it with its models and an email-labelled
 * display name. Pi recomposes the provider right after `login` resolves, so the
 * account's models show up in `/model` without a `/reload`.
 */
async function loginSlot(
  pi: ExtensionAPI,
  providerId: string,
  callbacks: Parameters<typeof loginAntigravity>[0],
): ReturnType<typeof loginAntigravity> {
  const credentials = await loginAntigravity(callbacks);
  try {
    registerSlot(pi, {
      slot: slotNumber(providerId) ?? 1,
      providerId,
      signedIn: true,
      email: credentials.email,
    });
  } catch {
    // Registration is a convenience: a failure here must not lose a valid login.
  }
  return credentials;
}

function formatAccountList(ctx: ExtensionContext): string {
  const active = activeProviderId(ctx);
  const lines = listAccountSlots().map((slot) => {
    const marker = slot.providerId === active ? "*" : " ";
    const who = slot.signedIn ? (slot.email ?? "signed in") : "not signed in";
    const hint = slot.signedIn ? "" : `  → /login ${slot.providerId}`;
    return `${marker} ${slot.slot}. ${slot.providerId.padEnd(16)} ${who}${hint}`;
  });
  return [
    "Antigravity accounts (* = current session)",
    ...lines,
    "",
    "Switch: /antigravity.account use <slot|email>",
    "Add:    /login antigravity-2   (slot count: ANTIGRAVITY_ACCOUNTS, max 8)",
  ].join("\n");
}

/**
 * Point the session at another account, keeping the current model id when that
 * account offers it. Account selection rides on the selected model, so this is
 * a model switch to the same model under a different provider slot.
 */
async function switchAccount(pi: ExtensionAPI, ctx: ExtensionContext, ref: string): Promise<void> {
  const target = resolveAccountRef(ref);
  if (!target) {
    emitCommandOutput(ctx, `Unknown account "${ref}".\n${formatAccountList(ctx)}`, "warning");
    return;
  }
  if (!target.signedIn) {
    emitCommandOutput(
      ctx,
      `Slot ${target.slot} (${target.providerId}) is not signed in. Run /login ${target.providerId} first.`,
      "warning",
    );
    return;
  }
  if (target.providerId === activeProviderId(ctx) && isAntigravityProviderId(ctx.model?.provider)) {
    emitCommandOutput(ctx, `Already on ${target.email ?? target.providerId}.`);
    return;
  }

  const available = ctx.modelRegistry
    .getAvailable()
    .filter((model: Model<Api>) => model.provider === target.providerId);
  const currentModelId = isAntigravityProviderId(ctx.model?.provider) ? ctx.model?.id : undefined;
  const model =
    (currentModelId
      ? (ctx.modelRegistry.find(target.providerId, currentModelId) ??
        available.find((entry) => entry.id === currentModelId))
      : undefined) ?? available[0];
  if (!model) {
    emitCommandOutput(
      ctx,
      `No models registered for ${target.providerId} yet. Run /antigravity.models sync, or /login ${target.providerId}.`,
      "warning",
    );
    return;
  }

  const ok = await pi.setModel(model);
  if (!ok) {
    emitCommandOutput(
      ctx,
      `Could not switch to ${target.providerId}: no usable credentials. Run /login ${target.providerId}.`,
      "warning",
    );
    return;
  }
  emitCommandOutput(
    ctx,
    `Antigravity account → slot ${target.slot} (${target.email ?? target.providerId}), model ${model.id}.`,
  );
  void refreshFooterUsage(ctx);
}

export default function (pi: ExtensionAPI): void {
  // Open the TLS connection up front so the first message of a session does not pay
  // the handshake. Opt out with ANTIGRAVITY_NO_PREWARM=1.
  const primaryEndpoint = endpointCandidates()[0];
  if (primaryEndpoint) prewarmConnection(primaryEndpoint);

  registerApiProvider({
    api: ANTIGRAVITY_API,
    stream: streamAntigravity,
    streamSimple: streamAntigravity,
  });

  // One provider per account slot: Pi stores exactly one credential per provider
  // id, so multi-account support means multiple ids sharing this implementation.
  for (const slot of listAccountSlots()) registerSlot(pi, slot);

  // --- Footer usage display ---
  pi.on("session_start", (_event, ctx) => {
    void refreshFooterUsage(ctx);
    void refreshModelRegistry(
      ctx,
      listAccountSlots()
        .filter((slot) => slot.signedIn)
        .map((slot) => slot.providerId),
    );
  });

  pi.on("agent_settled", (_event, ctx) => {
    void refreshFooterUsage(ctx);
  });

  pi.on("model_select", (_event, ctx) => {
    void refreshFooterUsage(ctx);
  });

  // --- Commands ---
  pi.registerCommand("antigravity.usage", {
    description: "Show Antigravity shared quota pools (Gemini / Claude+GPT, 5h + weekly)",
    handler: async (_args, ctx) => {
      await withUsage(ctx, formatUsageSummary);
    },
  });

  pi.registerCommand("antigravity.account", {
    description: "List Antigravity accounts, or switch with: use <slot|email>",
    handler: async (args, ctx) => {
      const text = (args || "").trim();
      const match = /^(?:use|switch)\s+(.+)$/i.exec(text);
      if (match) {
        await switchAccount(pi, ctx, match[1]);
        return;
      }
      if (text && !/^(list|ls)$/i.test(text)) {
        emitCommandOutput(ctx, `Usage: /antigravity.account [use <slot|email>]`, "warning");
        return;
      }
      emitCommandOutput(ctx, formatAccountList(ctx));
    },
  });

  pi.registerCommand("antigravity.models", {
    description: "List Antigravity runtime models + remaining pool fraction",
    handler: async (args, ctx) => {
      const all = /\ball\b/i.test(args || "");
      if (/\bsync\b/i.test(args || "")) {
        emitCommandOutput(ctx, "Syncing Antigravity model catalog…", "info");
        await refreshModelRegistry(ctx, [activeProviderId(ctx)]);
      }
      await withUsage(ctx, (usage) => formatModelsList(usage, { all }));
    },
  });

  pi.registerCommand("antigravity.doctor", {
    description: "Show sanitized Antigravity provider diagnostics",
    handler: async (_args, ctx) => {
      const d = getLastDiagnostics();
      const accounts = listAccountSlots()
        .map(
          (slot) =>
            `${slot.slot}:${slot.providerId}=${slot.signedIn ? (maskEmail(slot.email) ?? "signed-in") : "none"}`,
        )
        .join(" ");
      const lines = [
        `provider=${activeProviderId(ctx)}`,
        `accounts=${accounts}`,
        `lastResolvedRuntimeModel=${d.resolvedRuntimeModel || "none"}`,
        `availableModels=${d.availableModels || "none"}`,
        `matchedModel=${d.matchedModelDebug || "none"}`,
        `lastEndpoint=${d.endpoint || "none"}`,
        `lastStatus=${d.status ?? "none"}`,
        `lastProjectId=${d.projectId || "none"}`,
        ...(d.latencyMs !== undefined ? [`lastLatencyMs=${d.latencyMs}`] : []),
        `lastError=${d.error ? redactSecrets(d.error) : "none"}`,
        "transport=native-streamSimple",
        "runtimeCli=not-used",
        "commands=/antigravity.usage /antigravity.models /antigravity.account /antigravity.doctor",
      ];
      emitCommandOutput(ctx, `Antigravity doctor\n${lines.join("\n")}`);
    },
  });
}
