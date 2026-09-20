---
"@dereknex/pi-antigravity": minor
---

Merge the upstream 0.7.1–0.7.3 feature set into the multi-account fork.

### Added

- **Image generation:** `/antigravity.image` and a `generate_image` agent tool, saving to `.pi/generated-images/` (port of upstream `src/image/`).
- **Gemini 3.8 Flash:** added to the static catalog with Low/Medium/High routing and a runtime fallback to Gemini 3.7 Flash when the endpoint has not rolled out yet.
- **Streaming watchdogs:** a response-header deadline (default 180s) and a mid-body stall deadline (default 120s), configurable via `ANTIGRAVITY_STREAM_HEADER_TIMEOUT_MS` / `ANTIGRAVITY_STREAM_STALL_TIMEOUT_MS`; both accept `0` to disable.
- **Tool schema isolation:** unresolved or external `$ref` pointers no longer reject the whole request — the affected tool is dropped and reported in `/antigravity.doctor` as `toolSchemaWarnings`.
- **Skill blocks** in user turns are hoisted into `systemInstruction` instead of being replayed as user prose.

### Changed

- **Wire alignment with the Antigravity CLI:** request labels now carry `request_id`, stable `trajectory_id`, and `used_non_gemini_model`; `toolConfig` is omitted in default (auto) tool mode; thinking is sent as an integer `thinkingBudget` for every model; `model_enum` is learned from `fetchAvailableModels`.
- Invalid conversation boundaries are repaired instead of sent: a user bridge is inserted before model function-call turns that lost their boundary in compacted history, and skill-only turns no longer need synthetic user text.

### Fixed

- Transient 429 `RESOURCE_EXHAUSTED` responses are classified as retryable rate limits, so Pi's automatic retry backoff engages; real quota walls stay non-retryable.
- Final assistant tool calls without a tool result no longer break the session: a continuation turn is sent and the event is surfaced via `/antigravity.doctor` as `trailingToolCall`.
- Dropped the leftover `anthropic-beta` reasoning header and the legacy `VALIDATED` tool-config injection.
