# Changelog

## 0.8.0

### Minor Changes

- 03ccc0b: Replace the hand-rolled catalog cache with Pi's per-provider model store and adopt upstream's catalog grouping.

  ### Changed
  - **Catalog engine:** runtime variants are grouped into public model IDs the same way upstream does it — display-name and suffix tier parsing, `-tiered` rollout IDs, and the `gemini-pro-agent` / `gemini-3-flash-agent` aliases — while the curated static catalog keeps its hand-tuned routing.
  - **Catalog persistence:** each account slot's catalog now lives in Pi's per-provider model store (`~/.pi/agent/models-store.json`) instead of `antigravity-models-cache[.slot].json`, which is deleted on first refresh. Persistence and the in-memory catalog are published together, so an aborted refresh cannot desynchronise them.
  - **Refresh policy:** a refreshed catalog is reused for 4 hours (`ANTIGRAVITY_CATALOG_REFRESH_INTERVAL_MS`); `/antigravity.models sync` forces a refresh. Stale families are pruned when the backend stops advertising them.
  - **Model labels:** `model_enum` values learned from discovery are persisted with the catalog, so request labels stay accurate across restarts.

- 5aa4eb5: Merge the upstream 0.7.1–0.7.3 feature set into the multi-account fork.

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

### Patch Changes

- bade0c8: Read the system prompt and tool declarations from the transcript so pi >= 0.86 requests carry instructions and tools again.

  ### Fixed
  - **Prompt and tools on pi >= 0.86:** pi 0.86 replaced the flat provider `Context` with a normalized `TranscriptContext`, moving the rendered system prompt into system-message `sections` and the tool declarations into `toolsAdded` / `toolsRemoved`. The provider still read `context.systemPrompt` and `context.tools`, which are absent there, so every Antigravity turn went out with only the base Antigravity instructions and **no tools at all** — models hallucinated function calls and the backend answered `MALFORMED_FUNCTION_CALL`. `resolveCurrentSystemPrompt()` / `resolveCurrentTools()` now prefer pi-ai's `getCurrentSystemPrompt()` / `getCurrentTools()` helpers and fall back to replaying the transcript deltas themselves, with the flat fields kept as the pre-0.86 path.
  - Regression coverage in `scripts/test-transcript-context.ts` for section patching, `null` section removal, `toolsRemoved`, and the legacy flat `Context`.

## 0.7.0

### Minor Changes

- **Hide Opus in status bar by default:** Status bar now defaults to displaying only Gemini quota to keep the footer compact. Opus/Claude quota can still be enabled via `statusShowOpus` in settings or `ANTIGRAVITY_STATUS_SHOW_OPUS`.
- **Status bar reset countdown toggle:** Add `statusShowReset` in settings or `ANTIGRAVITY_STATUS_SHOW_RESET` environment variable to optionally display bucket reset countdowns in the status bar (e.g. `Gemini 5h:17.2%(3h 12m) w:6.2%(4d 8h)`).

## 0.6.0

### Minor Changes

- **Opus usage toggle:** Add configuration to toggle whether Opus (Claude/3P) usage is displayed in the status bar (`statusShowOpus` in `settings.json` or `ANTIGRAVITY_STATUS_SHOW_OPUS`).
- **Live status bar quota:** Display real-time 5h and weekly quota usage percentages in the Pi status bar (`antigravity.quota`), auto-refreshed across turns and model switches.
- **Multiple accounts:** Support up to 8 independent Google account slots (`antigravity`, `antigravity-2`, ...) with separate OAuth tokens, per-slot catalog caching, and instant switching via `/antigravity.account use`.
- **Automatic model catalog sync:** New model families advertised by the backend are registered automatically — no code change needed. On session start and via `/antigravity.models sync`, the extension queries the live `fetchAvailableModels` catalog, derives public model IDs from unknown runtime families (tier suffixes → thinking levels), and caches them to disk per slot.
- **Automated releases:** Integrated Changesets and GitHub Actions release workflow.

All notable changes to this project are documented in this file.

## [0.5.2] - 2026-08-30

### Fixed

- **Node Pi CLI:** The extension no longer uses `Bun.*` APIs at load time. `pi` (Node) can load it again; OAuth, hashing, env, and HTTP go through Node/`fetch`/`undici`.

## [0.5.1] - 2026-08-30

### Fixed

- **CI / publish:** Install Bun from the official script instead of `oven-sh/setup-bun`, which this repository's GitHub Actions allowlist rejects.

## [0.5.0] - 2026-08-30

### Changed

- **Bun runtime:** The extension is Bun-only. OAuth uses `Bun.serve`, hashing uses `Bun.CryptoHasher`, HTTP uses Bun's `fetch` pool (no `undici`), and the toolchain is Bun. This works when Pi itself is running on Bun (the compiled `pi` binary). The npm-installed Node `pi` CLI will not load Bun APIs.
- **Antigravity request shape:** Gemini 3.6/3.7 Flash use per-effort runtime IDs and `thinkingLevel`; 3.5 Flash and 3.1 Pro send `thinkingBudget`. Requests use the `antigravity/hub` user-agent, `daily-cloudcode-pa` first, default `VALIDATED` tool mode, and the `agent/<id>/<ts>/<trajectory>/<step>` request envelope.

### Fixed

- **Cross-provider tool history:** Unsigned Gemini 3+ function calls from other providers are replayed as text observations instead of triggering a `thought_signature` 400 (#22).
- **Error stops:** Stream errors now keep the provider `finishReason` and skip aborted/errored assistant turns on replay (#23).
- **Foreign thinking:** Thinking blocks from other models are dropped from Gemini history so they are not copied into the visible answer (#24).
- **Tool images:** Image blocks on `toolResult` messages are sent as `inlineData` (#25).
- **Prompt cache:** Fallback tool-call IDs no longer include `Date.now()`, so history stays byte-stable across turns (#26).
- **Compat registry:** Register `antigravity-api` with `@earendil-works/pi-ai/compat` so plugins like `pi-condense` can stream Antigravity models (#29).

## [0.4.1] - 2026-08-22

### Fixed

- **Proxy-aware requests:** When `HTTP_PROXY`, `HTTPS_PROXY`, or `ALL_PROXY` is set, skip the private keep-alive dispatcher so requests use Pi's proxy-aware global dispatcher instead of connecting around the proxy (#20).
- **Command display:** `/antigravity.usage`, `/antigravity.models`, and `/antigravity.doctor` no longer `console.log` into the interactive TUI (which overwrote the editor and status chrome). Reports go through Pi's chat `notify` in interactive mode and stdout only in headless mode (#19).

## [0.4.0] - 2026-08-22

### Performance

- **Keep-alive connection pool:** Provider requests now go through a long-lived `undici` dispatcher (60s idle keep-alive, 5 min max) so consecutive turns reuse one socket. Node's built-in fetch drops an idle socket after 4 seconds unless the server advertises a longer `Keep-Alive: timeout=`, and the Cloud Code Assist endpoint sends no such header, so every turn previously paid a fresh DNS + TCP + TLS handshake. Measured against the production endpoint with a 6 second gap between turns, median request-initiation time dropped from 97 ms to 30 ms. The dispatcher is scoped to this provider's own requests rather than installed globally, so it does not change HTTP behaviour for the rest of the host process. Disable with `ANTIGRAVITY_NO_KEEPALIVE=1`; opt into HTTP/2 with `ANTIGRAVITY_HTTP2=1`.
- **Connection pre-warm:** The TLS connection to the primary endpoint is opened when the extension loads, so the first message of a session skips the handshake as well. Disable with `ANTIGRAVITY_NO_PREWARM=1`.
- **Smaller request prefill:** Removed a duplicated copy of the Antigravity system instruction that was sent inside an `[ignore]` wrapper on every request, trimming 228 characters from every request body.

### Changed

- **SSE read buffer:** The streaming reader now advances a read offset and compacts its buffer once per network chunk instead of re-slicing it for every parsed line. This is a readability change, not a performance one: V8 represents the old `slice` as a sliced string rather than a copy, and benchmarking the two loops over a 1.6 MB response showed no meaningful difference.

### Tests

- Added `scripts/test-stream-sse.ts`, which replays a fixed SSE body at nine different chunk sizes (down to 1 byte) and asserts the parsed text, thinking, tool calls, usage, and emitted event sequence are identical for every chunk boundary.

## [0.3.1] - 2026-08-19

### Performance

- **Fast Time-to-First-Token (TTFT):** Bypassed pre-flight model discovery round-trips for known static models (`gemini-3.7-flash`, `claude-sonnet-4-6`, etc.), immediately sending streaming requests with verified runtime IDs and falling back to dynamic lookup only when needed.
- **Fast-path endpoint discovery:** Updated model discovery to prioritize the primary production endpoint and return immediately upon match, eliminating latency stalls from slower sandbox endpoints.
- **Parallelized usage & quota fetch:** `fetchAccountUsage()` now runs `loadCodeAssist`, `retrieveUserQuotaSummary`, and `fetchMergedAvailableModels` concurrently in a single `Promise.all()`, roughly halving `/antigravity.usage` execution time.

### Fixed

- **Turn alternation & message merge:** Automatically merge consecutive same-role messages (`user` or `model`) and guarantee initial user turn in `convertMessages()`, preventing 400 Bad Request multi-turn errors from Google Cloud Code Assist.
- **Base64 image Data URLs:** Sanitize image data by stripping `data:...;base64,` prefixes and auto-detecting MIME types in `asTextParts()` to prevent image payload rejection by Gemini.
- **Tool schema `$ref` dereferencing:** Inlined local `$defs` / `definitions` in tool schemas before meta keyword stripping, preventing dangling `$ref` schema errors on complex custom tools.
- **OAuth server socket cleanup:** Added friendly `EADDRINUSE` messaging for port 51121 and called `server.closeAllConnections()` for immediate socket teardown upon sign-in completion.

### Diagnostics

- **Latency & Doctor enhancements:** Added `lastLatencyMs` to `/antigravity.doctor` and introduced a safe `maskEmail` utility.

## [0.3.0] - 2026-08-16

### Performance

- **Parallelized model discovery:** `fetchAvailableRuntimeModel` probed 2 endpoints × 3 request-body variants sequentially (up to 6 awaited round-trips) on every cache miss before a generation request could even start. Fired concurrently instead, and removed two variants that were provably dead weight — one always returned a 400 (`cloudaicompanionProject` isn't a real field on this endpoint) and one was byte-identical to another. Measured against the live backend: cold model discovery down from ~3.6s to ~1.4s (2.5x), and the full cold-start setup path (token refresh + discovery) down from ~5.8s to ~1.1s (5.2x).
- **Skip redundant project discovery on token refresh:** `refreshAntigravityToken` always called `loadCodeAssist` even though its cache is keyed by token and a refresh always mints a new one, guaranteeing a wasted round-trip. Now skipped whenever the credentials already carry a `projectId` (the normal case).
- **Longer caches:** model-discovery and project-id caches extended from 10/5 minutes to 30 minutes, so the (now much cheaper) cold path is hit a third as often.
- **Parallelized `/antigravity.usage` and `/antigravity.models`:** merged model-catalog fetch across endpoints concurrently instead of sequentially, and dropped the same dead request-body variant.

## [0.2.10] - 2026-08-15

### Documentation

- **README & Security Polish:** Reorganized documentation with a table of contents, clear onboarding structure, detailed breakdown of required OAuth scopes in a reference table, and updated security policy.

## [0.2.9] - 2026-08-15

### Fixed

- **Gemini 3.7 Flash runtime routing:** Route every displayed effort through the live `gemini-3.7-flash-tiered` runtime and send Low, Medium, or High via `generationConfig.thinkingConfig`. Add the `aicode` OAuth scope used by the current Antigravity CLI so future logins receive the complete model catalog.

## [0.2.8] - 2026-08-14

### Added

- **Gemini 3.7 Flash Support:** Added public model `gemini-3.7-flash` with Low, Medium, and High thinking-effort routing to `gemini-3.7-flash-low|medium|high` and 65,536 output token budget.
- **Graceful Runtime Fallback:** Added automatic runtime candidate fallback (e.g. falling back to Gemini 3.6 Flash when 3.7 Flash is requested before backend deployment/activation) to prevent 404 stream rejections during server-side model rollouts.

## [0.2.7] - 2026-08-14

### Added

- **Gemini 3.7 Flash Support:** Added public model `gemini-3.7-flash` with Low, Medium, and High thinking-effort routing to `gemini-3.7-flash-low|medium|high` and 65,536 output token budget.

## [0.2.6] - 2026-08-04

### Fixed

- **Claude/GPT tool schema 400s:** Normalize custom-tool bridge schemas with an allowlist (`type`, `description`, `properties`, `required`, `items`, `enum`) instead of a denylist, so keywords like `nullable` and JSON Schema type unions (`["string","null"]`) no longer trigger `Unknown name` / Invalid JSON payload rejections from Cloud Code Assist.
- **Request-format error diagnostics:** Include the backend rejection message in friendly 400 errors so the unknown field is visible without digging through raw API responses.

## [0.2.5] - 2026-07-27

### Fixed

- **Maximum Output Token Limit (#6):** Default `maxOutputTokens` request budget now uses the model's full verified maximum output capacity instead of an arbitrary 8192-token fallback limit, preventing premature completion cut-offs on long responses. Added request-side token clamping matching exact backend per-runtime limits (65,536 for Gemini 3.6/3.5 Flash, 65,535 for Gemini 3.1 Pro, 64,000 for Claude Opus/Sonnet, 32,768 for GPT-OSS 120B) to prevent 400 Bad Request errors when caller options exceed model ceilings.
- **Thinking Model Accessibility & Routing (#7):** Added unit regression tests ensuring all public model IDs and thinking levels expose backend-supported routing and hiding unavailable levels. Recorded live model map keys and display labels across all advertised efforts.

## [0.2.4] - 2026-07-23

### Performance

- Skip redundant `loadCodeAssist` HTTP call per inference when credentials already carry a project ID.
- Cache `fetchAvailableRuntimeModel` results for 10 minutes, eliminating 2–6 repeated HTTP calls on every stream request.
- Rewrite SSE stream parser to use index-based scanning instead of `split('\n')`, removing per-chunk array allocations.
- Consolidate `loadCodeAssist` in `/antigravity.usage`: reuse a single response for both project ID resolution and tier info, and run quota summary fetch in parallel.
- Replace O(n) `projectCache` eviction with O(1) LRU (insertion-order delete).

## [0.2.3] - 2026-07-23

### Fixed

- Show only the thinking levels supported by each Antigravity model instead of every Pi level.

## [0.2.2] - 2026-07-21

### Added

- Gemini 3.6 Flash (`gemini-3.6-flash`) with Low/Medium/High thinking-effort routing to `gemini-3.6-flash-low|medium|high`.

### Changed

- Runtime model discovery keeps searching endpoint candidates so daily/sandbox-only models (currently 3.6 Flash) resolve correctly.

## [0.2.0] - 2026-07-21

### Added

- Isolated per-request diagnostics and the `/antigravity.doctor` command for sanitized provider troubleshooting.
- Coverage for model routing, tool-schema normalization, stable project IDs, and Claude tool-call conversion.

### Changed

- Split the provider into focused auth, client, diagnostics, models, streaming, types, usage, and utility modules.
- Made project-ID fallback stable per authenticated account instead of depending on the local working directory.
- Clarified OAuth client behavior and how to use a custom Google Cloud OAuth client.
- Bumped the package version to 0.2.0.

### Security

- Centralized API endpoint validation, callback loopback enforcement, and diagnostic secret redaction.
