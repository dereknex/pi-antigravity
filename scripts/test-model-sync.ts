import {
  ANTIGRAVITY_MODELS,
  applyDerivedModels,
  getAntigravityRequestModelId,
  isKnownAntigravityModel,
} from "../src/models/index.js";

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

const assert = {
  equal(actual: unknown, expected: unknown, message?: string) {
    if (actual !== expected) {
      fail(message ?? `expected ${String(expected)}, got ${String(actual)}`);
    }
  },
  deepEqual(actual: unknown, expected: unknown, message?: string) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      fail(message ?? `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  },
  ok(value: unknown, message?: string) {
    if (!value) fail(message ?? "expected a truthy value");
  },
};

type Row = { modelId: string; displayName?: string; supportsImages?: boolean; supportsThinking?: boolean };
const row = (modelId: string, extra: Omit<Row, "modelId"> = {}): Row => ({ modelId, ...extra });

// 1. A catalog containing only known runtime ids registers no new families.
const knownCatalog = [
  "gemini-3.7-flash-low",
  "gemini-3.7-flash-medium",
  "gemini-3.7-flash-high",
  "gemini-3.6-flash-low",
  "gemini-3.6-flash-medium",
  "gemini-3.6-flash-high",
  "gemini-3.5-flash-extra-low",
  "gemini-3.5-flash-low",
  "gemini-3-flash-agent",
  "gemini-3.1-pro-low",
  "gemini-pro-agent",
  "claude-opus-4-6-thinking",
  "claude-sonnet-4-6",
  "gpt-oss-120b-medium",
].map((modelId) => row(modelId, { supportsThinking: true, supportsImages: true }));
assert.equal(applyDerivedModels(knownCatalog), ANTIGRAVITY_MODELS, "known catalog must not add families");

// 2. A new Gemini family is derived with tier-based thinking levels and routing.
const newFamilyCatalog = [
  ...knownCatalog,
  row("tab_autocomplete"),
  row("gemini-4.0-flash-lite-low", { supportsThinking: true, supportsImages: true }),
  row("gemini-4.0-flash-lite-medium", { supportsThinking: true, supportsImages: true }),
  row("gemini-4.0-flash-lite-high", { supportsThinking: true }),
  row("gemini-3.7-flash-tiered"), // rollout-era variant of a static family must be ignored
];
const withNew = applyDerivedModels(newFamilyCatalog);
const derived = withNew.find((m) => m.id === "gemini-4.0-flash-lite");
assert.ok(derived, "new family must be registered");
assert.equal(derived!.name, "Gemini 4.0 Flash Lite (Antigravity)");
assert.ok(!withNew.some((m) => m.id.includes("tiered")), "static-family variants must not register");
assert.ok(!withNew.some((m) => m.id.startsWith("tab_")), "tab models must not register");
assert.deepEqual(derived!.thinkingLevelMap, {
  off: null,
  minimal: null,
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: null,
  max: null,
});
assert.equal(getAntigravityRequestModelId("gemini-4.0-flash-lite", "off"), "gemini-4.0-flash-lite-low");
assert.equal(getAntigravityRequestModelId("gemini-4.0-flash-lite", "high"), "gemini-4.0-flash-lite-high");
assert.ok(isKnownAntigravityModel("gemini-4.0-flash-lite"), "derived family counts as known");

// 3. extra-low families shift the ladder (extra-low=low, low=medium).
const shifted = applyDerivedModels([
  ...newFamilyCatalog,
  row("gemini-5.0-flash-extra-low", { supportsThinking: true }),
  row("gemini-5.0-flash-low", { supportsThinking: true }),
]);
const shiftedModel = shifted.find((m) => m.id === "gemini-5.0-flash");
assert.ok(shiftedModel, "extra-low family must be registered");
assert.equal(getAntigravityRequestModelId("gemini-5.0-flash", "low"), "gemini-5.0-flash-extra-low");
assert.equal(getAntigravityRequestModelId("gemini-5.0-flash", "medium"), "gemini-5.0-flash-low");

// 4. Unsuffixed claude-style rows map to the high level routed at themselves.
const unsuffixed = applyDerivedModels([
  ...newFamilyCatalog,
  row("claude-haiku-5", { supportsThinking: true }),
]);
assert.equal(getAntigravityRequestModelId("claude-haiku-5", "off"), "claude-haiku-5");
assert.equal(getAntigravityRequestModelId("claude-haiku-5", "high"), "claude-haiku-5");

// 5. Idempotent: a second pass with the same rows adds nothing new.
assert.equal(
  applyDerivedModels(newFamilyCatalog),
  ANTIGRAVITY_MODELS,
  "repeat refresh with same catalog must not duplicate",
);

console.log("model sync: derivation, filtering, routing, and idempotency passed");
