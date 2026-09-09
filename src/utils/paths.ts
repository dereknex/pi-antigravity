import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Pi's agent directory (holds auth.json, settings.json, and our caches).
 * Mirrors the host's `getAgentDir()` — env override first, `~/.pi/agent`
 * otherwise — without importing the host package at runtime.
 *
 * Kept import-free so both `models` and `utils` can depend on it without a cycle.
 */
export function agentDir(): string {
  const envDir = process.env.PI_CODING_AGENT_DIR;
  if (envDir) return envDir;
  return join(homedir(), ".pi", "agent");
}

/** Path to Pi's credential file. Read-only for this extension. */
export function authJsonPath(): string {
  return join(agentDir(), "auth.json");
}
