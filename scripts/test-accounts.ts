import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Point the account helpers at a throwaway agent dir before importing them, so
// this never reads or writes the developer's real ~/.pi/agent/auth.json.
const fixtureDir = mkdtempSync(join(tmpdir(), "antigravity-accounts-"));
process.env.PI_CODING_AGENT_DIR = fixtureDir;
delete process.env.ANTIGRAVITY_ACCOUNTS;
delete process.env.NOAGY_ACCOUNTS;

const {
  DEFAULT_ACCOUNT_SLOTS,
  MAX_ACCOUNT_SLOTS,
  accountSlotCount,
  accountSlotFor,
  isAntigravityProviderId,
  listAccountSlots,
  providerDisplayName,
  providerSlots,
  resolveAccountRef,
  slotNumber,
  slotProviderId,
} = await import("../src/accounts/index.js");
const { catalogCachePath } = await import("../src/models/index.js");

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

function withAccounts(value: string | undefined, fn: () => void): void {
  if (value === undefined) delete process.env.ANTIGRAVITY_ACCOUNTS;
  else process.env.ANTIGRAVITY_ACCOUNTS = value;
  try {
    fn();
  } finally {
    delete process.env.ANTIGRAVITY_ACCOUNTS;
  }
}

// 1. Slot 1 keeps the bare provider id; later slots are suffixed.
assert.equal(slotProviderId(1), "antigravity", "slot 1 must stay the primary id");
assert.equal(slotProviderId(0), "antigravity", "slot 0 collapses onto the primary id");
assert.equal(slotProviderId(2), "antigravity-2");
assert.equal(slotProviderId(8), "antigravity-8");

// 2. slotNumber is the exact inverse, and rejects anything that is not a slot.
assert.equal(slotNumber("antigravity"), 1);
assert.equal(slotNumber("antigravity-2"), 2);
assert.equal(slotNumber("antigravity-8"), MAX_ACCOUNT_SLOTS);
assert.equal(slotNumber("antigravity-9"), undefined, "slots past the ceiling are not ours");
assert.equal(slotNumber("antigravity-1"), undefined, "slot 1 is only ever the bare id");
assert.equal(slotNumber("antigravity-0"), undefined);
assert.equal(slotNumber("antigravity-x"), undefined);
assert.equal(slotNumber("antigravity-2-extra"), undefined);
assert.equal(slotNumber("anthropic"), undefined);
assert.equal(slotNumber(undefined), undefined);
assert.ok(isAntigravityProviderId("antigravity-3"), "registered slots are ours");
assert.ok(!isAntigravityProviderId("openai"), "other providers are not ours");

// 3. ANTIGRAVITY_ACCOUNTS controls slot count and is clamped to 1..8.
withAccounts(undefined, () => assert.equal(accountSlotCount(), DEFAULT_ACCOUNT_SLOTS));
withAccounts("", () => assert.equal(accountSlotCount(), DEFAULT_ACCOUNT_SLOTS));
withAccounts("nope", () => assert.equal(accountSlotCount(), DEFAULT_ACCOUNT_SLOTS));
withAccounts(" 4 ", () => assert.equal(accountSlotCount(), 4, "surrounding space is trimmed"));
withAccounts("0", () => assert.equal(accountSlotCount(), 1, "at least one slot"));
withAccounts("-3", () => assert.equal(accountSlotCount(), 1));
withAccounts("99", () => assert.equal(accountSlotCount(), MAX_ACCOUNT_SLOTS, "clamped to the ceiling"));
withAccounts("1", () =>
  assert.deepEqual(providerSlots(), ["antigravity"], "a single account registers one slot"),
);
withAccounts("3", () =>
  assert.deepEqual(providerSlots(), ["antigravity", "antigravity-2", "antigravity-3"]),
);

// 4. Sign-in state and emails come from auth.json, and only for our slots.
writeFileSync(
  join(fixtureDir, "auth.json"),
  JSON.stringify({
    antigravity: { type: "oauth", email: "primary@example.com", access: "secret" },
    "antigravity-3": { type: "oauth", email: "Work@Example.com" },
    "antigravity-9": { type: "oauth", email: "out-of-range@example.com" },
    anthropic: { type: "oauth", email: "other-provider@example.com" },
  }),
);
withAccounts("3", () => {
  const slots = listAccountSlots();
  assert.deepEqual(
    slots,
    [
      { slot: 1, providerId: "antigravity", signedIn: true, email: "primary@example.com" },
      { slot: 2, providerId: "antigravity-2", signedIn: false, email: undefined },
      { slot: 3, providerId: "antigravity-3", signedIn: true, email: "Work@Example.com" },
    ],
    "auth.json drives sign-in state without leaking tokens",
  );
  assert.ok(
    !JSON.stringify(slots).includes("secret"),
    "slot listings must never carry credential material",
  );

  // 5. Reference resolution: slot number, provider id, or email substring.
  assert.equal(resolveAccountRef("2")?.providerId, "antigravity-2");
  assert.equal(resolveAccountRef(" 3 ")?.providerId, "antigravity-3");
  assert.equal(resolveAccountRef("antigravity-3")?.slot, 3);
  assert.equal(resolveAccountRef("ANTIGRAVITY-3")?.slot, 3, "provider ids are case-insensitive");
  assert.equal(resolveAccountRef("work@")?.slot, 3, "email match is case-insensitive");
  assert.equal(resolveAccountRef("primary")?.slot, 1);
  assert.equal(resolveAccountRef("9")?.providerId, undefined, "unregistered slots do not resolve");
  assert.equal(resolveAccountRef("nobody@example.com"), undefined);
  assert.equal(resolveAccountRef("   "), undefined);
});

// 6. accountSlotFor works for slots outside the registered range (e.g. after
// lowering ANTIGRAVITY_ACCOUNTS while a session still points at a high slot).
withAccounts("1", () => {
  assert.equal(accountSlotFor("antigravity-3")?.signedIn, true);
  assert.equal(accountSlotFor("antigravity-3")?.email, "Work@Example.com");
  assert.equal(accountSlotFor("antigravity-2")?.signedIn, false);
  assert.equal(accountSlotFor("openai"), undefined);
});

// 7. Display names identify the account in `/model` and `/login`.
assert.equal(providerDisplayName("antigravity"), "Antigravity");
assert.equal(providerDisplayName("antigravity", "a@b.com"), "Antigravity (a@b.com)");
assert.equal(providerDisplayName("antigravity-2"), "Antigravity #2");
assert.equal(providerDisplayName("antigravity-2", "a@b.com"), "Antigravity #2 (a@b.com)");

// 8. Each slot caches its own catalog; slot 1 keeps the legacy filename.
assert.equal(catalogCachePath(), join(fixtureDir, "antigravity-models-cache.json"));
assert.equal(catalogCachePath("antigravity"), join(fixtureDir, "antigravity-models-cache.json"));
assert.equal(
  catalogCachePath("antigravity-2"),
  join(fixtureDir, "antigravity-models-cache.antigravity-2.json"),
  "one account's catalog must not overwrite another's",
);

console.log("accounts: OK");
