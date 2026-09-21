/**
 * pi >= 0.86 hands providers a normalized TranscriptContext: the system prompt and the
 * tool declarations live in system messages, and the flat `context.systemPrompt` /
 * `context.tools` fields are gone. Reading the flat fields there silently dropped both,
 * so Antigravity turns went out with no instructions and no tools — the model then
 * hallucinated a function call and the backend answered MALFORMED_FUNCTION_CALL.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const fixtureDir = mkdtempSync(join(tmpdir(), "antigravity-transcript-"));
process.env.PI_CODING_AGENT_DIR = fixtureDir;

import type { Api, Context, Model, Tool } from "@earendil-works/pi-ai";
import { buildRequest, resolveCurrentSystemPrompt, resolveCurrentTools } from "../src/stream/index.js";

function fail(message: string): never {
  throw new Error(message);
}

const assert = {
  equal(actual: unknown, expected: unknown, message?: string) {
    if (actual !== expected) fail(message ?? `expected ${String(expected)}, got ${String(actual)}`);
  },
  ok(value: unknown, message?: string) {
    if (!value) fail(message ?? "expected a truthy value");
  },
  deepEqual(actual: unknown, expected: unknown, message?: string) {
    if (!Bun.deepEquals(actual, expected)) {
      fail(message ?? `expected ${Bun.inspect(expected)}, got ${Bun.inspect(actual)}`);
    }
  },
  match(actual: string, pattern: RegExp) {
    if (!pattern.test(actual)) fail(`expected ${JSON.stringify(actual)} to match ${pattern}`);
  },
};

const model = {
  id: "gemini-3.8-flash",
  name: "Gemini 3.8 Flash",
  api: "antigravity-api",
  provider: "antigravity",
  reasoning: true,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 1000000,
  maxTokens: 65536,
} as Model<Api>;

const readTool = {
  name: "read",
  description: "Read file contents",
  parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
} as Tool;

const writeTool = {
  name: "write",
  description: "Write file contents",
  parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
} as Tool;

const userMessage = {
  role: "user",
  content: "github #50",
  timestamp: 1,
} as Context["messages"][number];

// --- pi >= 0.86 shape: sections + toolsAdded on the leading system message ---------------
const transcriptContext = {
  messages: [
    {
      role: "system",
      content: "",
      sections: { preamble: "You are pi.", rules: "Be brief." },
      toolsAdded: [readTool, writeTool],
      timestamp: 0,
    },
    userMessage,
  ],
} as unknown as Context;

// The exact fields the pre-fix code read are absent in this shape — that is the bug.
assert.equal(
  transcriptContext.tools,
  undefined,
  "pi 0.86 transcript context carries no flat tools field",
);
assert.equal(
  transcriptContext.systemPrompt,
  undefined,
  "pi 0.86 transcript context carries no flat systemPrompt field",
);

assert.equal(
  resolveCurrentSystemPrompt(transcriptContext),
  "You are pi.\n\nBe brief.",
  "system prompt must be rendered from sections",
);
assert.deepEqual(
  resolveCurrentTools(transcriptContext)?.map((tool) => tool.name),
  ["read", "write"],
  "tools must be resolved from toolsAdded",
);

const transcriptRequest = buildRequest(model, transcriptContext, "test-proj", {}, "gemini-3.8-flash");
const instructionText = (transcriptRequest.request.systemInstruction?.parts ?? [])
  .map((part) => part.text)
  .join("\n");
assert.match(instructionText, /You are pi\./, "request must carry the transcript system prompt");
assert.match(instructionText, /Be brief\./);
assert.deepEqual(
  transcriptRequest.request.tools?.[0]?.functionDeclarations.map((decl) => decl.name),
  ["read", "write"],
  "request must declare transcript tools",
);

// --- section removal and tool removal deltas --------------------------------------------
const afterDelta = {
  messages: [
    {
      role: "system",
      content: "base",
      sections: { rules: "keep", docs: "drop" },
      toolsAdded: [readTool, writeTool],
      timestamp: 0,
    },
    {
      role: "system",
      content: "",
      sections: { docs: null, rules: "updated" },
      toolsRemoved: [{ name: "write" }],
      timestamp: 1,
    },
    userMessage,
  ],
} as unknown as Context;

assert.equal(resolveCurrentSystemPrompt(afterDelta), "base\n\nupdated", "null section is removed");
assert.deepEqual(
  resolveCurrentTools(afterDelta)?.map((tool) => tool.name),
  ["read"],
  "toolsRemoved must drop the tool",
);

// --- legacy flat Context (pi < 0.86) still works ----------------------------------------
const legacyContext = {
  systemPrompt: "legacy prompt",
  tools: [readTool],
  messages: [userMessage],
} as Context;

assert.equal(resolveCurrentSystemPrompt(legacyContext), "legacy prompt");
assert.deepEqual(resolveCurrentTools(legacyContext)?.map((tool) => tool.name), ["read"]);

const legacyRequest = buildRequest(model, legacyContext, "test-proj", {}, "gemini-3.8-flash");
assert.match(
  (legacyRequest.request.systemInstruction?.parts ?? []).map((part) => part.text).join("\n"),
  /legacy prompt/,
);
assert.ok(legacyRequest.request.tools, "legacy context must still declare tools");

console.log("transcript context: pi >= 0.86 sections/tools and legacy Context passed");
