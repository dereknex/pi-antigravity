---
"@dereknex/pi-antigravity": patch
---

Read the system prompt and tool declarations from the transcript so pi >= 0.86 requests carry instructions and tools again.

### Fixed

- **Prompt and tools on pi >= 0.86:** pi 0.86 replaced the flat provider `Context` with a normalized `TranscriptContext`, moving the rendered system prompt into system-message `sections` and the tool declarations into `toolsAdded` / `toolsRemoved`. The provider still read `context.systemPrompt` and `context.tools`, which are absent there, so every Antigravity turn went out with only the base Antigravity instructions and **no tools at all** — models hallucinated function calls and the backend answered `MALFORMED_FUNCTION_CALL`. `resolveCurrentSystemPrompt()` / `resolveCurrentTools()` now prefer pi-ai's `getCurrentSystemPrompt()` / `getCurrentTools()` helpers and fall back to replaying the transcript deltas themselves, with the flat fields kept as the pre-0.86 path.
- Regression coverage in `scripts/test-transcript-context.ts` for section patching, `null` section removal, `toolsRemoved`, and the legacy flat `Context`.
