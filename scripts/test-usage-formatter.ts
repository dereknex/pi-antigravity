import {
  formatFooterStatus,
  formatUsageSummary,
  isStatusOpusEnabled,
  parseOpusConfigValue,
  parseOpusSettingFromFile,
} from "../src/usage/usage.js";
import { expect } from "bun:test";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

// Test isStatusOpusEnabled with env vars
const prevEnv = process.env.ANTIGRAVITY_STATUS_SHOW_OPUS;
try {
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

console.log("Usage formatter tests passed!");
