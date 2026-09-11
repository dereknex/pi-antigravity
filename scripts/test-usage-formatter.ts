import { expect } from "bun:test";
import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Isolate test from developer's ~/.pi/agent/settings.json
const testAgentDir = mkdtempSync(join(tmpdir(), "antigravity-usage-test-"));
process.env.PI_CODING_AGENT_DIR = testAgentDir;

import {
  formatFooterStatus,
  formatReset,
  formatUsageSummary,
  isStatusOpusEnabled,
  isStatusResetEnabled,
  parseBooleanConfigValue,
  parseOpusConfigValue,
  parseOpusSettingFromFile,
  parseResetSettingFromFile,
} from "../src/usage/usage.js";

console.log("Running usage formatter tests...");

const baseUsage = {
  projectId: "test",
  endpoint: "test",
  groups: [],
  models: [],
  fetchedAt: Date.now(),
};

// Regression fixture for #3501 error message
const message3501 =
  "/v1internal:retrieveUserQuotaSummary failed: You are currently configured to use a Google Cloud Project but lack a Gemini Code Assist license. Please contact your administrator to request a license. (#3501)";

const out = formatUsageSummary({
  ...baseUsage,
  quotaSummaryError: message3501,
});

expect(
  out.includes("needs a paid subscription") || out.includes("free-tier can't use that endpoint"),
).toBe(true);

// Test parseOpusConfigValue
expect(parseOpusConfigValue(true)).toBe(true);
expect(parseOpusConfigValue(false)).toBe(false);
expect(parseOpusConfigValue("true")).toBe(true);
expect(parseOpusConfigValue("false")).toBe(false);
expect(parseOpusConfigValue("1")).toBe(true);
expect(parseOpusConfigValue("0")).toBe(false);
expect(parseOpusConfigValue("yes")).toBe(true);
expect(parseOpusConfigValue("no")).toBe(false);
expect(parseOpusConfigValue("on")).toBe(true);
expect(parseOpusConfigValue("off")).toBe(false);
expect(parseOpusConfigValue(1)).toBe(true);
expect(parseOpusConfigValue(0)).toBe(false);
expect(parseOpusConfigValue("invalid")).toBe(undefined);
expect(parseOpusConfigValue(undefined)).toBe(undefined);

// Test formatFooterStatus with showOpus option
const mockUsage = {
  projectId: "test",
  endpoint: "test",
  groups: [
    {
      displayName: "Gemini Models",
      buckets: [
        {
          bucketId: "gemini-5h",
          displayName: "5h",
          window: "5h",
          resetTime: "2026-01-01T00:00:00Z",
          remainingFraction: 0.8,
        },
      ],
    },
    {
      displayName: "Claude and GPT models",
      buckets: [
        {
          bucketId: "3p-5h",
          displayName: "5h",
          window: "5h",
          resetTime: "2026-01-01T00:00:00Z",
          remainingFraction: 0.5,
        },
      ],
    },
  ],
  models: [],
  fetchedAt: Date.now(),
};

const withOpus = formatFooterStatus(mockUsage, { showOpus: true });
expect(withOpus).toContain("Gemini 5h:20%");
expect(withOpus).toContain("Opus 5h:50%");

const withoutOpus = formatFooterStatus(mockUsage, { showOpus: false });
expect(withoutOpus).toBe("Gemini 5h:20%");
expect(withoutOpus).not.toContain("Opus");

// Test default formatFooterStatus (defaults to hiding Opus and hiding reset time)
const defaultFooter = formatFooterStatus(mockUsage);
expect(defaultFooter).toBe("Gemini 5h:20%");
expect(defaultFooter).not.toContain("Opus");
expect(defaultFooter).not.toContain("(");

// Test formatFooterStatus with reset time
const withReset = formatFooterStatus(mockUsage, { showReset: true });
expect(withReset).toContain("Gemini 5h:20%(now)");
expect(withReset).not.toContain("Opus");

const withOpusAndReset = formatFooterStatus(mockUsage, { showOpus: true, showReset: true });
expect(withOpusAndReset).toContain("Gemini 5h:20%(now)");
expect(withOpusAndReset).toContain("Opus 5h:50%(now)");

// Test formatReset
expect(formatReset(undefined)).toBe("n/a");
expect(formatReset("invalid-date")).toBe("invalid-date");
const futureDate = new Date(Date.now() + 2 * 3600 * 1000 + 15 * 60 * 1000).toISOString();
expect(formatReset(futureDate)).toBe("2h 15m");

// Test parseResetSettingFromFile with nested and flat JSON
const tempResetFile = join(tmpdir(), `pi-antigravity-test-reset-settings-${Date.now()}.json`);
try {
  writeFileSync(tempResetFile, JSON.stringify({ antigravity: { statusShowReset: true } }));
  expect(parseResetSettingFromFile(tempResetFile)).toBe(true);

  writeFileSync(tempResetFile, JSON.stringify({ antigravity: { showResetTime: false } }));
  expect(parseResetSettingFromFile(tempResetFile)).toBe(false);

  writeFileSync(tempResetFile, JSON.stringify({ "antigravity.statusShowReset": true }));
  expect(parseResetSettingFromFile(tempResetFile)).toBe(true);
} finally {
  try {
    unlinkSync(tempResetFile);
  } catch {}
}

// Test isStatusResetEnabled with env vars and default
const prevResetEnv = process.env.ANTIGRAVITY_STATUS_SHOW_RESET;
try {
  delete process.env.ANTIGRAVITY_STATUS_SHOW_RESET;
  expect(isStatusResetEnabled()).toBe(false);

  process.env.ANTIGRAVITY_STATUS_SHOW_RESET = "1";
  expect(isStatusResetEnabled()).toBe(true);

  process.env.ANTIGRAVITY_STATUS_SHOW_RESET = "0";
  expect(isStatusResetEnabled()).toBe(false);
} finally {
  if (prevResetEnv !== undefined) {
    process.env.ANTIGRAVITY_STATUS_SHOW_RESET = prevResetEnv;
  } else {
    delete process.env.ANTIGRAVITY_STATUS_SHOW_RESET;
  }
}

// Test parseOpusSettingFromFile with nested and flat JSON
const tempFile = join(tmpdir(), `pi-antigravity-test-settings-${Date.now()}.json`);
try {
  writeFileSync(tempFile, JSON.stringify({ antigravity: { statusShowOpus: false } }));
  expect(parseOpusSettingFromFile(tempFile)).toBe(false);

  writeFileSync(tempFile, JSON.stringify({ antigravity: { showOpusUsage: true } }));
  expect(parseOpusSettingFromFile(tempFile)).toBe(true);

  writeFileSync(tempFile, JSON.stringify({ "antigravity.statusShowOpus": false }));
  expect(parseOpusSettingFromFile(tempFile)).toBe(false);
} finally {
  try {
    unlinkSync(tempFile);
  } catch {}
}

// Test isStatusOpusEnabled with env vars and default
const prevEnv = process.env.ANTIGRAVITY_STATUS_SHOW_OPUS;
try {
  delete process.env.ANTIGRAVITY_STATUS_SHOW_OPUS;
  expect(isStatusOpusEnabled()).toBe(false);

  process.env.ANTIGRAVITY_STATUS_SHOW_OPUS = "0";
  expect(isStatusOpusEnabled()).toBe(false);

  process.env.ANTIGRAVITY_STATUS_SHOW_OPUS = "1";
  expect(isStatusOpusEnabled()).toBe(true);

  delete process.env.ANTIGRAVITY_STATUS_SHOW_OPUS;
} finally {
  if (prevEnv !== undefined) {
    process.env.ANTIGRAVITY_STATUS_SHOW_OPUS = prevEnv;
  } else {
    delete process.env.ANTIGRAVITY_STATUS_SHOW_OPUS;
  }
}

try {
  rmSync(testAgentDir, { recursive: true, force: true });
} catch {}

console.log("Usage formatter tests passed!");
