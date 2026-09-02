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
assert.deepEqual(
  applyDerivedModels(knownCatalog).map((m) => m.id),
  ANTIGRAVITY_MODELS.map((m) => m.id),
  "known catalog must not add families",
);

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

// 5. Repeated refresh returns the full list, keeps derived families, and never duplicates.
const repeat = applyDerivedModels(newFamilyCatalog);
assert.ok(repeat.some((m) => m.id === "gemini-4.0-flash-lite"), "repeat refresh keeps derived family");
const repeatIds = repeat.map((m) => m.id);
assert.equal(new Set(repeatIds).size, repeatIds.length, "repeat refresh must not duplicate models");
assert.ok(
  !repeat.some((m) => m.id === "gemini-5.0-flash"),
  "stale families from earlier refreshes must be removed",
);
assert.ok(
  !repeat.some((m) => m.id === "claude-haiku-5"),
  "stale families from earlier refreshes must be removed",
);

// 6. When a derived family disappears from the catalog it is dropped from routing too.
const backToKnown = applyDerivedModels(knownCatalog);
assert.ok(
  !backToKnown.some((m) => m.id === "gemini-4.0-flash-lite"),
  "removed derived family must disappear from the list",
);
assert.ok(
  !isKnownAntigravityModel("gemini-4.0-flash-lite"),
  "removed derived family must no longer be known",
);

console.log("model sync: derivation, filtering, routing, and idempotency passed");

// 7. Catalog row cache: write → read round-trip, corrupt file, and derived restore.
//    Cache lives at ~/.pi/agent/antigravity-models-cache.json; tests must not
//    clobber a real one, so they back it up and restore it.
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { readCachedModelRows, writeCachedModelRows } from "../src/models/index.js";

const realCache = join(homedir(), ".pi", "agent", "antigravity-models-cache.json");
const backup = `${realCache}.test-backup`;
const hadReal = existsSync(realCache);
if (hadReal) cpSync(realCache, backup);
try {
  writeCachedModelRows(newFamilyCatalog as never[]);
  const restored = readCachedModelRows();
  assert.deepEqual(restored?.map((r) => r.modelId), newFamilyCatalog.map((r) => r.modelId), "cache round-trip returns written rows");

  // Corrupt cache must not crash the reader.
  const { writeFileSync } = await import("node:fs");
  writeFileSync(realCache, "{not json");
  assert.equal(readCachedModelRows(), undefined, "corrupt cache reads as undefined");

  // Offline restore rebuilds the full derived list from cached rows.
  rmSync(realCache);
  assert.equal(readCachedModelRows(), undefined, "missing cache reads as undefined");

  writeCachedModelRows(newFamilyCatalog as never[]);
  const rebuilt = applyDerivedModels(readCachedModelRows() ?? []);
  assert.ok(rebuilt.some((m) => m.id === "gemini-4.0-flash-lite"), "cached rows rebuild derived families");
  assert.equal(
    rebuilt.filter((m) => ANTIGRAVITY_MODELS.some((s) => s.id === m.id)).length,
    ANTIGRAVITY_MODELS.length,
    "cached rows rebuild the static baseline alongside derived families",
  );
} finally {
  if (hadReal) {
    cpSync(backup, realCache);
    rmSync(backup);
  } else if (existsSync(realCache)) {
    rmSync(realCache);
  }
}

console.log("model sync: cache restore behavior passed");
