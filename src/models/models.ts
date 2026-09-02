import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";
import type { AntigravityRouting, ModelQuotaRow } from "../types/types.js";
import { ThinkingEffort } from "../types/enums.js";

export const PROVIDER_ID = "antigravity";
export const PROVIDER_NAME = "Antigravity";

/**
 * Public selectable model IDs → backend request model IDs by thinking effort.
 *
 * Catalog mirrors `agy models` (Antigravity CLI), which currently advertises:
 * - Gemini 3.7 Flash (Low / Medium / High)
 * - Gemini 3.6 Flash (Low / Medium / High)
 * - Gemini 3.5 Flash (Low / Medium / High)
 * - Gemini 3.1 Pro (Low / High)
 * - Claude Sonnet 4.6 (Thinking)
 * - Claude Opus 4.6 (Thinking)
 * - GPT-OSS 120B (Medium)
 *
 * Pi exposes those as public model IDs and only surfaces the exact thinking levels
 * advertised by the backend for each model.
 */
export const ANTIGRAVITY_ROUTING: Record<string, AntigravityRouting> = {
  "claude-opus-4-6": {
    routing: {
      minimal: "claude-opus-4-6-thinking",
      low: "claude-opus-4-6-thinking",
      medium: "claude-opus-4-6-thinking",
      high: "claude-opus-4-6-thinking",
    },
    defaultRequestId: "claude-opus-4-6-thinking",
  },
  // Live fetchAvailableModels exposes `claude-sonnet-4-6` (display: Thinking), not a separate *-thinking id.
  "claude-sonnet-4-6": {
    off: "claude-sonnet-4-6",
    routing: {
      minimal: "claude-sonnet-4-6",
      low: "claude-sonnet-4-6",
      medium: "claude-sonnet-4-6",
      high: "claude-sonnet-4-6",
      xhigh: "claude-sonnet-4-6",
    },
    defaultRequestId: "claude-sonnet-4-6",
  },
  "gemini-3.1-pro": {
    // `gemini-3.1-pro-high` is advertised but currently 400s for agent streamGenerateContent;
    // `gemini-pro-agent` is the working High runtime id (same display name in fetchAvailableModels).
    off: "gemini-3.1-pro-low",
    routing: {
      minimal: "gemini-3.1-pro-low",
      low: "gemini-3.1-pro-low",
      medium: "gemini-3.1-pro-low",
      high: "gemini-pro-agent",
      xhigh: "gemini-pro-agent",
    },
    defaultRequestId: "gemini-3.1-pro-low",
  },
  "gemini-3.7-flash": {
    off: "gemini-3.7-flash-low",
    routing: {
      minimal: "gemini-3.7-flash-low",
      low: "gemini-3.7-flash-low",
      medium: "gemini-3.7-flash-medium",
      high: "gemini-3.7-flash-high",
      xhigh: "gemini-3.7-flash-high",
    },
    defaultRequestId: "gemini-3.7-flash-low",
  },
  "gemini-3.6-flash": {
    // agy models: gemini-3.6-flash-low / -medium / -high
    off: "gemini-3.6-flash-low",
    routing: {
      minimal: "gemini-3.6-flash-low",
      low: "gemini-3.6-flash-low",
      medium: "gemini-3.6-flash-medium",
      high: "gemini-3.6-flash-high",
      xhigh: "gemini-3.6-flash-high",
    },
    defaultRequestId: "gemini-3.6-flash-low",
  },
  "gemini-3.5-flash": {
    off: "gemini-3.5-flash-extra-low",
    routing: {
      minimal: "gemini-3.5-flash-extra-low",
      low: "gemini-3.5-flash-extra-low",
      medium: "gemini-3.5-flash-low",
      high: "gemini-3-flash-agent",
      xhigh: "gemini-3-flash-agent",
    },
    defaultRequestId: "gemini-3.5-flash-extra-low",
  },
  "gpt-oss-120b": {
    off: "gpt-oss-120b-medium",
    routing: {
      minimal: "gpt-oss-120b-medium",
      low: "gpt-oss-120b-medium",
      medium: "gpt-oss-120b-medium",
      high: "gpt-oss-120b-medium",
    },
    defaultRequestId: "gpt-oss-120b-medium",
  },
};

/**
 * Verified maximum output tokens accepted by the Cloud Code Assist backend per model/runtime ID.
 * Requesting more than these limits returns a 400 Bad Request from the API.
 */
export const RUNTIME_MAX_OUTPUT_TOKENS: Record<string, number> = {
  "gemini-3.7-flash": 65536,
  "gemini-3.7-flash-tiered": 65536,
  // Retain rollout-era IDs for compatibility with pinned runtime overrides.
  "gemini-3.7-flash-low": 65536,
  "gemini-3.7-flash-medium": 65536,
  "gemini-3.7-flash-high": 65536,
  "gemini-3.6-flash": 65536,
  "gemini-3.6-flash-low": 65536,
  "gemini-3.6-flash-medium": 65536,
  "gemini-3.6-flash-high": 65536,
  "gemini-3.5-flash": 65536,
  "gemini-3.5-flash-extra-low": 65536,
  "gemini-3.5-flash-low": 65536,
  "gemini-3-flash-agent": 65536,
  "gemini-3.1-pro": 65535,
  "gemini-3.1-pro-low": 65535,
  "gemini-3.1-pro-high": 65535,
  "gemini-pro-agent": 65535,
  "claude-opus-4-6": 64000,
  "claude-opus-4-6-thinking": 64000,
  "claude-sonnet-4-6": 64000,
  "gpt-oss-120b": 32768,
  "gpt-oss-120b-medium": 32768,
};

export function getMaxOutputTokens(modelId: string, runtimeModel?: string): number {
  if (runtimeModel && RUNTIME_MAX_OUTPUT_TOKENS[runtimeModel] !== undefined) {
    return RUNTIME_MAX_OUTPUT_TOKENS[runtimeModel];
  }
  if (RUNTIME_MAX_OUTPUT_TOKENS[modelId] !== undefined) {
    return RUNTIME_MAX_OUTPUT_TOKENS[modelId];
  }
  if (runtimeModel) {
    if (runtimeModel.startsWith("claude-")) return 64000;
    if (runtimeModel.startsWith("gpt-oss-")) return 32768;
    if (runtimeModel.startsWith("gemini-3.1-pro") || runtimeModel === "gemini-pro-agent")
      return 65535;
    if (runtimeModel.startsWith("gemini-")) return 65536;
  }
  return 8192;
}

const freeCost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

// A null entry is intentionally hidden by Pi. Do not collapse levels that happen to
// route to the same runtime ID: the UI must reflect the levels the backend advertises.
const thinkingLevelMaps = {
  lowMediumHigh: {
    off: null,
    minimal: null,
    low: "low",
    medium: "medium",
    high: "high",
    xhigh: null,
    max: null,
  },
  lowHigh: {
    off: null,
    minimal: null,
    low: "low",
    medium: null,
    high: "high",
    xhigh: null,
    max: null,
  },
  thinking: {
    off: null,
    minimal: null,
    low: null,
    medium: null,
    high: "high",
    xhigh: null,
    max: null,
  },
  medium: {
    off: null,
    minimal: null,
    low: null,
    medium: "medium",
    high: null,
    xhigh: null,
    max: null,
  },
} satisfies Record<string, ProviderModelConfig["thinkingLevelMap"]>;

/** Same set as `agy models`, collapsed to public Pi model IDs. */
export const ANTIGRAVITY_MODELS: ProviderModelConfig[] = [
  {
    id: "gemini-3.7-flash",
    name: "Gemini 3.7 Flash (Antigravity)",
    reasoning: true,
    thinkingLevelMap: thinkingLevelMaps.lowMediumHigh,
    input: ["text", "image"],
    cost: freeCost,
    contextWindow: 1048576,
    maxTokens: 65536,
  },
  {
    id: "gemini-3.6-flash",
    name: "Gemini 3.6 Flash (Antigravity)",
    reasoning: true,
    thinkingLevelMap: thinkingLevelMaps.lowMediumHigh,
    input: ["text", "image"],
    cost: freeCost,
    contextWindow: 1048576,
    maxTokens: 65536,
  },
  {
    id: "claude-opus-4-6",
    name: "Claude Opus 4.6 (Antigravity)",
    reasoning: true,
    thinkingLevelMap: thinkingLevelMaps.thinking,
    input: ["text", "image"],
    cost: freeCost,
    contextWindow: 250000,
    maxTokens: 64000,
  },
  {
    id: "claude-sonnet-4-6",
    name: "Claude Sonnet 4.6 (Antigravity)",
    reasoning: true,
    thinkingLevelMap: thinkingLevelMaps.thinking,
    input: ["text", "image"],
    cost: freeCost,
    contextWindow: 200000,
    maxTokens: 64000,
  },
  {
    id: "gemini-3.1-pro",
    name: "Gemini 3.1 Pro (Antigravity)",
    reasoning: true,
    thinkingLevelMap: thinkingLevelMaps.lowHigh,
    input: ["text", "image"],
    cost: freeCost,
    contextWindow: 1048576,
    maxTokens: 65535,
  },
  {
    id: "gemini-3.5-flash",
    name: "Gemini 3.5 Flash (Antigravity)",
    reasoning: true,
    thinkingLevelMap: thinkingLevelMaps.lowMediumHigh,
    input: ["text", "image"],
    cost: freeCost,
    contextWindow: 1048576,
    maxTokens: 65536,
  },
  {
    id: "gpt-oss-120b",
    name: "GPT-OSS 120B (Antigravity)",
    reasoning: true,
    thinkingLevelMap: thinkingLevelMaps.medium,
    input: ["text"],
    cost: freeCost,
    contextWindow: 131072,
    maxTokens: 32768,
  },
];

/** Routing entries derived from the live backend catalog (see applyDerivedModels). */
const derivedRouting: Record<string, AntigravityRouting> = {};

/** Resolve public model id + thinking effort to Antigravity runtime model id. */
export function getAntigravityRequestModelId(modelId: string, effort: string | undefined): string {
  const r = derivedRouting[modelId] ?? ANTIGRAVITY_ROUTING[modelId];
  if (!r) return modelId;

  if (effort === undefined || effort === "off") {
    return r.off ?? r.routing?.minimal ?? r.routing?.low ?? r.defaultRequestId ?? modelId;
  }

  const effortKey = effort as ThinkingEffort;
  if (effortKey === ThinkingEffort.Xhigh) {
    return (
      r.routing?.xhigh ??
      r.routing?.high ??
      r.routing?.low ??
      r.routing?.minimal ??
      r.off ??
      r.defaultRequestId ??
      modelId
    );
  }

  return (
    r.routing?.[effortKey] ??
    r.routing?.low ??
    r.routing?.minimal ??
    r.off ??
    r.defaultRequestId ??
    modelId
  );
}

/** True when a model id has curated static routing or was derived from the live catalog. */
export function isKnownAntigravityModel(modelId: string): boolean {
  return modelId in ANTIGRAVITY_ROUTING || modelId in derivedRouting;
}

// --- Live catalog sync ---------------------------------------------------

/**
 * Derive Pi model configs from the backend `fetchAvailableModels` catalog so NEW
 * model families appear in the picker without a code change. Families with
 * curated static routing always keep it (quirks like `gemini-pro-agent` must not
 * be auto-remapped); derivation only ADDS unknown families.
 *
 * ponytail: tier changes *within* an existing family (e.g. a new `-medium` on
 * gemini-3.7-flash) still need a code update — auto-overriding curated routing
 * risks regressing working models.
 */
type RuntimeTier = "extra-low" | "low" | "medium" | "high" | "thinking" | "agent" | "none";

/** Runtime `-agent` ids whose family name cannot be derived by suffix stripping. */
const AGENT_QUIRKS: Record<string, { family: string; tier: RuntimeTier }> = {
  "gemini-pro-agent": { family: "gemini-3.1-pro", tier: "agent" },
  "gemini-3-flash-agent": { family: "gemini-3.5-flash", tier: "agent" },
};

/** Check order matters: `-extra-low` must be tested before `-low`. */
const RUNTIME_SUFFIXES = ["-extra-low", "-thinking", "-medium", "-high", "-agent", "-low"] as const;

function classifyRuntimeId(modelId: string): { family: string; tier: RuntimeTier } | undefined {
  const quirk = AGENT_QUIRKS[modelId];
  if (quirk) return quirk;
  for (const suffix of RUNTIME_SUFFIXES) {
    if (modelId.endsWith(suffix) && modelId.length > suffix.length) {
      return { family: modelId.slice(0, -suffix.length), tier: suffix.slice(1) as RuntimeTier };
    }
  }
  if (/^(gemini|claude|gpt-oss)/i.test(modelId)) return { family: modelId, tier: "none" };
  return undefined;
}

/**
 * Pi thinking level for a runtime tier within its family. Families advertising
 * `extra-low` shift the ladder down one (extra-low=low, low=medium, medium=high),
 * matching the curated gemini-3.5-flash mapping.
 */
function piLevelForTier(
  tier: RuntimeTier,
  tiers: ReadonlyMap<RuntimeTier, unknown>,
): ThinkingEffort | undefined {
  if (tier === "agent" || tier === "thinking" || tier === "none") return ThinkingEffort.High;
  if (tiers.has("extra-low")) {
    if (tier === "extra-low") return ThinkingEffort.Low;
    if (tier === "low") return ThinkingEffort.Medium;
    if (tier === "medium") return ThinkingEffort.High;
    return undefined;
  }
  if (tier === "low") return ThinkingEffort.Low;
  if (tier === "medium") return ThinkingEffort.Medium;
  if (tier === "high") return ThinkingEffort.High;
  return undefined;
}

function prettyFamilyName(family: string): string {
  const acronyms = new Set(["gpt", "oss"]);
  return family
    .split(/[-_]/)
    .map((part) =>
      acronyms.has(part) ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join(" ");
}

function defaultContextWindow(family: string): number {
  if (family.startsWith("claude-opus")) return 250_000;
  if (family.startsWith("claude")) return 200_000;
  if (family.startsWith("gpt-oss")) return 131_072;
  return 1_048_576; // gemini and unknown families
}

const LEVEL_ORDER: ThinkingEffort[] = [
  ThinkingEffort.Low,
  ThinkingEffort.Medium,
  ThinkingEffort.High,
];

/**
 * Merge a live runtime catalog into the registered model list. Returns the full
 * list to register (static + newly derived); never empty, never undefined — an
 * empty refresh would wipe the picker. Updates derived routing in place.
 */
export function applyDerivedModels(rows: ModelQuotaRow[]): ProviderModelConfig[] {
  const families = new Map<
    string,
    {
      tiers: Map<RuntimeTier, string>;
      supportsImages: boolean;
      supportsThinking: boolean;
    }
  >();

  for (const row of rows) {
    if (/tab_|chat_/i.test(row.modelId)) continue;
    const classified = classifyRuntimeId(row.modelId);
    if (!classified) continue;
    // Image-generation variants are not chat models.
    if (classified.family.endsWith("-image")) continue;
    // Curated static routing wins; derivation only registers unknown families.
    if (ANTIGRAVITY_ROUTING[classified.family]) continue;
    // Skip rollout-era runtime variants of static families (e.g. gemini-3.7-flash-tiered).
    if (
      Object.keys(ANTIGRAVITY_ROUTING).some(
        (id) => classified.family !== id && classified.family.startsWith(`${id}-`),
      )
    ) {
      continue;
    }

    let entry = families.get(classified.family);
    if (!entry) {
      entry = { tiers: new Map(), supportsImages: false, supportsThinking: false };
      families.set(classified.family, entry);
    }
    if (!entry.tiers.has(classified.tier)) entry.tiers.set(classified.tier, row.modelId);
    entry.supportsImages ||= row.supportsImages ?? false;
    entry.supportsThinking ||= row.supportsThinking ?? false;
  }

  const newModels: ProviderModelConfig[] = [];
  for (const [family, entry] of families) {
    if (derivedRouting[family]) continue; // already registered by an earlier refresh

    const levels = new Map<ThinkingEffort, string>();
    // Tier priority resolves High-level collisions: explicit thinking/agent runtimes
    // beat the unsuffixed base id (e.g. gemini-2.5-flash-thinking > gemini-2.5-flash).
    for (const tier of [
      "agent",
      "thinking",
      "none",
      "extra-low",
      "low",
      "medium",
      "high",
    ] as RuntimeTier[]) {
      const runtimeId = entry.tiers.get(tier);
      if (!runtimeId) continue;
      const level = piLevelForTier(tier, entry.tiers);
      if (level && !levels.has(level)) levels.set(level, runtimeId);
    }
    if (!levels.size) continue;

    const lowestRuntime =
      LEVEL_ORDER.map((level) => levels.get(level)).find((id) => id !== undefined) ??
      [...levels.values()][0];

    const levelMap: ProviderModelConfig["thinkingLevelMap"] = {
      off: null,
      minimal: null,
      low: null,
      medium: null,
      high: null,
      xhigh: null,
      max: null,
    };
    const routing: AntigravityRouting["routing"] = {};
    if (entry.supportsThinking) {
      for (const [level, runtimeId] of levels) {
        levelMap[level] =
          level === ThinkingEffort.Low
            ? "low"
            : level === ThinkingEffort.Medium
              ? "medium"
              : "high";
        routing[level] = runtimeId;
      }
    }

    derivedRouting[family] = {
      off: lowestRuntime,
      routing,
      defaultRequestId: lowestRuntime,
    };

    newModels.push({
      id: family,
      // Catalog displayNames can be stale on the daily endpoint; derive from the id.
      name: `${prettyFamilyName(family)} (Antigravity)`,
      reasoning: entry.supportsThinking,
      thinkingLevelMap: levelMap,
      input: entry.supportsImages ? ["text", "image"] : ["text"],
      cost: freeCost,
      contextWindow: defaultContextWindow(family),
      maxTokens: getMaxOutputTokens(family, lowestRuntime),
    });
  }

  return newModels.length ? [...ANTIGRAVITY_MODELS, ...newModels] : ANTIGRAVITY_MODELS;
}

/**
 * If a next-gen model (e.g. Gemini 3.7 Flash) is not yet available on the backend,
 * provide a fallback runtime model ID (e.g. Gemini 3.6 Flash) to maintain availability.
 */
export function getFallbackRuntimeModel(runtimeModel: string, effort?: string): string | undefined {
  if (runtimeModel === "gemini-3.7-flash-tiered") {
    return getAntigravityRequestModelId("gemini-3.6-flash", effort);
  }
  if (runtimeModel.startsWith("gemini-3.7-flash-")) {
    return runtimeModel.replace("gemini-3.7-flash-", "gemini-3.6-flash-");
  }
  if (runtimeModel === "gemini-3.7-flash") {
    return "gemini-3.6-flash-low";
  }
  return undefined;
}

export type GeminiThinkingLevel = "MINIMAL" | "LOW" | "MEDIUM" | "HIGH";

export type ThinkingWire = {
  includeThoughts: boolean;
  thinkingLevel?: GeminiThinkingLevel;
  thinkingBudget?: number;
};

export const ANTIGRAVITY_MODEL_ENUM: Record<string, string> = {
  "gemini-3.5-flash-extra-low": "MODEL_PLACEHOLDER_M187",
  "gemini-3.5-flash-low": "MODEL_PLACEHOLDER_M20",
  "gemini-3-flash-agent": "MODEL_PLACEHOLDER_M132",
  "gemini-3.1-pro-low": "MODEL_PLACEHOLDER_M36",
  "gemini-pro-agent": "MODEL_PLACEHOLDER_M16",
};

function googleLevel(effort: string | undefined): GeminiThinkingLevel {
  if (effort === "high" || effort === "xhigh") return "HIGH";
  if (effort === "medium") return "MEDIUM";
  return "LOW";
}

export function getThinkingConfig(
  modelId: string,
  effort: string | undefined,
): ThinkingWire | undefined {
  if (modelId === "gemini-3.7-flash" || modelId === "gemini-3.6-flash") {
    return { includeThoughts: true, thinkingLevel: googleLevel(effort) };
  }
  if (modelId === "gemini-3.5-flash") {
    if (!effort || effort === "off") return { includeThoughts: false, thinkingBudget: 0 };
    const thinkingBudget =
      effort === "high" || effort === "xhigh" ? 10_000 : effort === "medium" ? 4_000 : 1_000;
    return { includeThoughts: true, thinkingBudget };
  }
  if (modelId === "gemini-3.1-pro") {
    if (!effort || effort === "off") return { includeThoughts: false, thinkingBudget: 0 };
    return {
      includeThoughts: true,
      thinkingBudget: effort === "high" || effort === "xhigh" ? 10_001 : 1_001,
    };
  }
  return undefined;
}
