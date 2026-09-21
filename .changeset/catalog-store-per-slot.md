---
"@dereknex/pi-antigravity": minor
---

Replace the hand-rolled catalog cache with Pi's per-provider model store and adopt upstream's catalog grouping.

### Changed

- **Catalog engine:** runtime variants are grouped into public model IDs the same way upstream does it — display-name and suffix tier parsing, `-tiered` rollout IDs, and the `gemini-pro-agent` / `gemini-3-flash-agent` aliases — while the curated static catalog keeps its hand-tuned routing.
- **Catalog persistence:** each account slot's catalog now lives in Pi's per-provider model store (`~/.pi/agent/models-store.json`) instead of `antigravity-models-cache[.slot].json`, which is deleted on first refresh. Persistence and the in-memory catalog are published together, so an aborted refresh cannot desynchronise them.
- **Refresh policy:** a refreshed catalog is reused for 4 hours (`ANTIGRAVITY_CATALOG_REFRESH_INTERVAL_MS`); `/antigravity.models sync` forces a refresh. Stale families are pruned when the backend stops advertising them.
- **Model labels:** `model_enum` values learned from discovery are persisted with the catalog, so request labels stay accurate across restarts.
