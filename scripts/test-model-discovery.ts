import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Keep catalog persistence and legacy-cache cleanup out of the developer's real
// ~/.pi/agent directory.
const fixtureDir = mkdtempSync(join(tmpdir(), "antigravity-discovery-"));
process.env.PI_CODING_AGENT_DIR = fixtureDir;
delete process.env.ANTIGRAVITY_CATALOG_REFRESH_INTERVAL_MS;
delete process.env.ANTIGRAVITY_REFRESH_INTERVAL_MS;

import type { ModelsPublication, RefreshModelsContext } from "@earendil-works/pi-ai";
import {
  ANTIGRAVITY_MODELS,
  ANTIGRAVITY_PERSIST_KEY,
  ANTIGRAVITY_ROUTING,
  applyAntigravityCatalog,
  buildAntigravityCatalog,
  clearModelEnumCache,
  getAntigravityRequestModelId,
  getCurrentAntigravityCatalog,
  getModelEnum,
  hydrateAntigravityCatalog,
  isKnownAntigravityModel,
  refreshSlotCatalog,
  registerModelEnum,
  resetAntigravityCatalogsForTests,
  restoreDynamicModelEnums,
  snapshotDynamicModelEnums,
  type AntigravityCatalog,
} from "../src/models/index.js";
import { mergeAvailableModelsResults } from "../src/usage/index.js";
import type { AvailableModelsRaw, ModelInfoRaw } from "../src/types/types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`FAILED: ${message}`);
}

const fallback: AntigravityCatalog = { models: ANTIGRAVITY_MODELS, routing: ANTIGRAVITY_ROUTING };
const info = (displayName: string, extra?: Partial<ModelInfoRaw>): ModelInfoRaw => ({
  displayName,
  supportsThinking: true,
  supportsImages: true,
  ...extra,
});

// --- 1. Catalog building ---------------------------------------------------

const catalog = buildAntigravityCatalog(
  {
    "gemini-3.9-flash-low": info("Gemini 3.9 Flash (Low)"),
    "gemini-3.9-flash-medium": info("Gemini 3.9 Flash (Medium)"),
    "gemini-3.9-flash-high": info("Gemini 3.9 Flash (High)"),
    chat_hidden: info("Hidden chat"),
    "gemini-3-pro-image": info("Gemini 3 Pro Image"),
    "gemini-3.7-flash-low": info("Gemini 3.7 Flash (Low)"),
  },
  fallback,
);
assert(
  catalog.models.some((model) => model.id === "gemini-3.9-flash"),
  "discovers new model families",
);
assert(
  catalog.routing["gemini-3.9-flash"]?.routing?.medium === "gemini-3.9-flash-medium",
  "routes discovered thinking variants",
);
assert(
  !catalog.models.some((model) => model.id === "chat_hidden"),
  "filters hidden chat models",
);
assert(
  !catalog.models.some((model) => model.id === "gemini-3-pro-image"),
  "filters image models",
);
assert(
  catalog.routing["gemini-3.7-flash"] === fallback.routing["gemini-3.7-flash"],
  "curated static routing wins over derived routing for known families",
);
assert(
  catalog.models.some((model) => model.id === "gpt-oss-120b"),
  "keeps curated models the backend did not advertise",
);

// --- 2. Per-slot isolation -------------------------------------------------

const slotTwoModel = buildAntigravityCatalog(
  { "gemini-9.9-flash-low": info("Gemini 9.9 Flash (Low)") },
  fallback,
);
applyAntigravityCatalog("antigravity", catalog);
applyAntigravityCatalog("antigravity-2", slotTwoModel);

assert(
  getCurrentAntigravityCatalog("antigravity").models.some((m) => m.id === "gemini-3.9-flash"),
  "slot 1 sees its own catalog",
);
assert(
  !getCurrentAntigravityCatalog("antigravity-2").models.some((m) => m.id === "gemini-3.9-flash"),
  "slot 2 must not see slot 1's catalog",
);
assert(
  getCurrentAntigravityCatalog("antigravity-3").models === ANTIGRAVITY_MODELS,
  "a slot with no catalog falls back to the curated baseline",
);
assert(
  getAntigravityRequestModelId("gemini-9.9-flash", "low", "antigravity-2") ===
    "gemini-9.9-flash-low",
  "slot 2 routes its own discovered family",
);
assert(
  getAntigravityRequestModelId("gemini-9.9-flash", "low", "antigravity") === "gemini-9.9-flash",
  "slot 1 does not route a family it never discovered",
);
assert(isKnownAntigravityModel("gemini-3.9-flash", "antigravity"), "discovered family is known");
assert(
  !isKnownAntigravityModel("gemini-3.9-flash", "antigravity-2"),
  "known-model checks are scoped to the slot",
);
assert(isKnownAntigravityModel("gemini-3.7-flash", "antigravity-2"), "static families stay known");

// --- 3. Persisted state hydrate -------------------------------------------

clearModelEnumCache();
registerModelEnum("gemini-9.9-flash-low", "MODEL_DYNAMIC_999");
const stored = {
  [ANTIGRAVITY_PERSIST_KEY]: {
    catalog: slotTwoModel,
    checkedAt: 1_700_000_000_000,
    modelEnums: snapshotDynamicModelEnums(),
  },
};
resetAntigravityCatalogsForTests();
clearModelEnumCache();

assert(
  hydrateAntigravityCatalog("antigravity-2", stored) === 1_700_000_000_000,
  "hydrate returns the recorded refresh time",
);
assert(
  getCurrentAntigravityCatalog("antigravity-2").models.some((m) => m.id === "gemini-9.9-flash"),
  "hydrate restores the slot catalog",
);
assert(
  getModelEnum("gemini-9.9-flash-low") === "MODEL_DYNAMIC_999",
  "hydrate restores discovered model enums",
);
assert(hydrateAntigravityCatalog("antigravity", undefined) === 0, "ignores absent stored data");
assert(
  hydrateAntigravityCatalog("antigravity", { [ANTIGRAVITY_PERSIST_KEY]: {} }) === 0,
  "ignores malformed stored data",
);
assert(
  getCurrentAntigravityCatalog("antigravity").models === ANTIGRAVITY_MODELS,
  "malformed state must not disturb the slot catalog",
);

// --- refresh harness -------------------------------------------------------

type RefreshOptions = {
  allowNetwork: boolean;
  force?: boolean;
  stored?: unknown;
  credential?: RefreshModelsContext["credential"];
  rawModels?: AvailableModelsRaw["models"];
  fail?: boolean;
};

async function refresh(providerId: string, options: RefreshOptions) {
  let fetchCalls = 0;
  let published: ModelsPublication | undefined;
  const result = await refreshSlotCatalog(
    providerId,
    {
      credential: options.credential,
      stored: options.stored as never,
      allowNetwork: options.allowNetwork,
      force: options.force,
      signal: new AbortController().signal,
      publish: async (publication: ModelsPublication) => {
        published = publication;
        publication.update?.();
        return true;
      },
    },
    async () => {
      fetchCalls += 1;
      if (options.fail) throw new Error("network down");
      return { models: options.rawModels ?? {} };
    },
  );
  return { result, fetchCalls, published };
}

const credentials: RefreshModelsContext["credential"] = {
  type: "api_key",
  key: JSON.stringify({ token: "fake-token", projectId: "fake-project" }),
};

// --- 4. Offline phase restores without touching the network ----------------

const offline = await refresh("antigravity-2", { allowNetwork: false, stored });
assert(
  offline.result.some((model) => model.id === "gemini-9.9-flash"),
  "offline refresh restores the persisted catalog",
);
assert(offline.fetchCalls === 0, "offline refresh never fetches");

// --- 5. Fresh TTL skips discovery -----------------------------------------

resetAntigravityCatalogsForTests();
restoreDynamicModelEnums({ "gemini-9.9-flash-low": "MODEL_DYNAMIC_999" });
const freshStored = {
  [ANTIGRAVITY_PERSIST_KEY]: {
    catalog: slotTwoModel,
    // hydrate recorded "now" for the previous test; keep it inside the TTL
    checkedAt: Date.now(),
    modelEnums: snapshotDynamicModelEnums(),
  },
};
const fresh = await refresh("antigravity-2", {
  allowNetwork: true,
  stored: freshStored,
  credential: credentials,
});
assert(fresh.fetchCalls === 0, "a catalog refreshed inside the TTL is reused");
assert(
  fresh.result.some((model) => model.id === "gemini-9.9-flash"),
  "TTL reuse still returns the persisted catalog",
);

// --- 6. Discovery persists catalog, timestamp, and enums -------------------

resetAntigravityCatalogsForTests();
clearModelEnumCache();
const discovered = await refresh("antigravity", {
  allowNetwork: true,
  force: true,
  credential: credentials,
  rawModels: {
    "gemini-10.0-flash-high": {
      displayName: "Gemini 10.0 Flash (High)",
      model: "MODEL_DYNAMIC_1000",
    },
  },
});
assert(
  discovered.result.some((model) => model.id === "gemini-10.0-flash"),
  "forced refresh registers the discovered family",
);
const persisted = discovered.published?.persist as
  | (Record<string, unknown> & { models?: unknown[] })
  | undefined;
const privateState = persisted?.[ANTIGRAVITY_PERSIST_KEY] as
  | { catalog?: AntigravityCatalog; checkedAt?: number; modelEnums?: Record<string, string> }
  | undefined;
assert(privateState?.catalog?.routing, "persists routing with the model list");
assert(
  privateState?.modelEnums?.["gemini-10.0-flash-high"] === "MODEL_DYNAMIC_1000",
  "persists discovered enum values",
);
assert(persisted && Array.isArray(persisted.models), "persists the model list itself");
assert(
  (persisted.models as Array<{ provider?: string }>).every(
    (model) => model.provider === "antigravity",
  ),
  "persisted models carry the slot's provider id",
);
assert(
  getModelEnum("gemini-10.0-flash-high") === "MODEL_DYNAMIC_1000",
  "discovered enums are usable immediately",
);

// --- 7. Failures keep the last-known-good catalog --------------------------

const failing = await refresh("antigravity", {
  allowNetwork: true,
  force: true,
  credential: credentials,
  rawModels: { "gemini-10.1-flash-low": info("Gemini 10.1 Flash (Low)") },
});
assert(
  failing.result.some((model) => model.id === "gemini-10.1-flash"),
  "a later refresh registers the newly advertised family",
);
assert(
  !failing.result.some((model) => model.id === "gemini-10.0-flash"),
  "families the backend stopped advertising are pruned",
);

const retained = await refresh("antigravity", {
  allowNetwork: true,
  credential: credentials,
  fail: true,
});
assert(
  retained.result.some((model) => model.id === "gemini-10.1-flash"),
  "background refresh failure retains the last-known-good catalog",
);

let forcedError: unknown;
try {
  await refresh("antigravity", { allowNetwork: true, force: true, credential: credentials, fail: true });
} catch (error) {
  forcedError = error;
}
assert(forcedError instanceof Error, "a forced refresh reports discovery failures");

// --- 8. Legacy cache files are cleaned up ---------------------------------

const legacyPath = join(fixtureDir, "antigravity-models-cache.antigravity-7.json");
writeFileSync(legacyPath, JSON.stringify({ cachedAt: Date.now(), rows: [{ modelId: "x" }] }));
await refresh("antigravity-7", { allowNetwork: false });
let legacyExists = true;
try {
  const { existsSync } = await import("node:fs");
  legacyExists = existsSync(legacyPath);
} catch {
  legacyExists = true;
}
assert(!legacyExists, "the obsolete catalog cache file is removed");

// --- 9. Discovery merge registers enums -----------------------------------

mergeAvailableModelsResults([
  {
    endpoint: "https://cloudcode-pa.googleapis.com",
    status: 200,
    data: { models: { "catalog-dynamic": { model: "MODEL_CATALOG_DYNAMIC" } } },
  },
]);
assert(getModelEnum("catalog-dynamic") === "MODEL_CATALOG_DYNAMIC", "registers discovery enums");

console.log("model discovery: catalog grouping, per-slot isolation, persistence, TTL passed");
