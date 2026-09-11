# pi-antigravity

[![npm version](https://img.shields.io/npm/v/pi-antigravity?logo=npm)](https://www.npmjs.com/package/pi-antigravity)
[![license](https://img.shields.io/npm/l/pi-antigravity)](LICENSE)

**pi-antigravity** is a [Pi Coding Agent](https://pi.dev) provider that lets Pi talk directly to Google Antigravity / Cloud Code Assist models — Gemini, plus the Claude and GPT-OSS models Antigravity also advertises. Sign in with Google, pick a model, and go. Under the hood it handles OAuth login, native streaming, model routing, and quota diagnostics itself, so it never shells out to an external Antigravity CLI.

> **Unofficial integration.** This project is not affiliated with or endorsed by Google. Use it only with an account and services you are authorized to access, and review its source before granting OAuth permissions.

## Contents

- [Requirements](#requirements)
- [Install](#install)
- [Quick start](#quick-start)
- [Differences from upstream / 与上游差异](#differences-from-upstream--与上游差异)
- [Authentication and credential safety](#authentication-and-credential-safety)
- [Multiple accounts](#multiple-accounts)
- [Usage and status bar display](#usage-and-status-bar-display)
- [Commands](#commands)
- [Models and routing](#models-and-routing)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)
- [Development](#development)

## Requirements

- Pi Coding Agent and Pi AI version **0.80.0 or later**
- A Google account that can use the relevant Cloud Code Assist / Antigravity services
- A browser to complete the Google sign-in. Same-machine is best (the browser hits the local callback automatically); on a remote/headless machine, complete sign-in anywhere and paste the resulting callback URL back into Pi (see [Troubleshooting](#troubleshooting)).

## Install

Install from npm:

```bash
pi install npm:@dereknex/pi-antigravity
```

Or install the latest repository version:

```bash
pi install git:github.com/dereknex/pi-antigravity
```

Restart Pi (or run `/reload`) after installation. To update the npm package later, use `pi update npm:@dereknex/pi-antigravity`.

## Quick start

1. Start Pi and run `/login antigravity`.
2. Complete Google sign-in in your browser.
3. Select a model, for example:

   ```text
   /model antigravity/gemini-3.7-flash
   ```

4. Start working. If a request fails, run `/antigravity.doctor` for sanitized diagnostics.

## Differences from Upstream / 与上游差异

Compared to upstream [`Rahularya01/pi-antigravity`](https://github.com/Rahularya01/pi-antigravity), this fork introduces three major architectural and functional enhancements:

| Feature                                          | Upstream (`Rahularya01/pi-antigravity`)                                                                         | This Fork (`pi-antigravity`)                                                                                                                                                                                                                                                             |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dynamic Model Discovery**<br>(动态获取模型)    | Static hardcoded array of 7 models in code; new models or tier changes require code modifications and releases. | **Fully dynamic**: Automatically polls Google's `fetchAvailableModels` backend catalog, derives new model families and thinking level maps (`extra-low` / `low` / `medium` / `agent`), caches models to disk per slot, and supports manual catalog re-sync (`/antigravity.models sync`). |
| **Usage & Status Bar**<br>(用量显示与状态栏控制) | Only supports basic text dump in `/antigravity.usage`.                                                          | **Live status bar footer** (`antigravity.quota`) with 5-hour and weekly quota percentages, auto-refreshing on turn end/model switch, visual reset countdowns, and configurable Opus display toggle (`ANTIGRAVITY_STATUS_SHOW_OPUS` / `antigravity.statusShowOpus`).                      |
| **Multi-Account Slots**<br>(多账号支持)          | Single Google account slot only (`antigravity`).                                                                | **1–8 independent account slots** (`antigravity`, `antigravity-2`, ...) with separate OAuth tokens, isolated quota pools, per-account catalog cache files, status bar account tags, and quick account switching (`/antigravity.account use <slot\|email>`).                              |

### 1. Dynamic Model Discovery & Derivation (动态获取模型)

- **Backend Catalog Discovery**: Automatically queries the Google Cloud Code Assist `fetchAvailableModels` endpoint at session startup and on demand via `/antigravity.models sync`.
- **Automatic Derivation (`applyDerivedModels`)**: When Google rolls out new model families (such as `gemini-3.8-flash` or new third-party models), the extension dynamically maps runtime tiers to Pi thinking levels, configures context windows and input modalities, and exposes them in `/model` without requiring an extension update.
- **Offline Cache & Resilience**: Raw backend rows are persisted to `~/.pi/agent/antigravity-models-cache[.slot].json`. On offline restarts, models are restored instantly from disk cache. Background refresh failures gracefully retain existing models ("retain on failure").

### 2. Live Quota & Status Bar Display (用量显示与状态栏控制)

- **Real-Time Status Bar**: Integrated directly into Pi's footer (`antigravity.quota`), showing 5-hour and weekly usage percentages (e.g. `Gemini 5h:17.2% w:6.2% · Opus 5h:99.3% w:34.2%`).
- **Opus Usage Visibility Control**: You can toggle whether Claude / Opus / 3P quotas are displayed in the status bar:
  - In `settings.json`: `"antigravity": { "statusShowOpus": false }`
  - Via environment variable: `export ANTIGRAVITY_STATUS_SHOW_OPUS=false` (or `0` / `off` / `no`)
- **Rich Quota Inspector**: `/antigravity.usage` displays visual progress bars, percentage used, and precise reset countdowns for Gemini and third-party quota buckets.

### 3. Multi-Account Slots & Isolation (多账号支持)

- **Slot Provisioning**: Register up to 8 slots (`antigravity`, `antigravity-2`, ..., `antigravity-8`) using `ANTIGRAVITY_ACCOUNTS` (default `3`).
- **Quota & Credential Isolation**: Each slot signs in with its own Google account (`/login antigravity-2`) and draws from its own quota pool.
- **Per-Account Catalog**: Because entitlements differ across Google accounts, each slot maintains its own isolated model cache file.
- **Quick Switching**: Switch accounts seamlessly via `/antigravity.account use <slot|email>` or by selecting an account's model directly in `/model`. Non-primary accounts display an informative tag in the status bar (e.g. `#2 work`).

## Authentication and credential safety

The provider uses the OAuth 2.0 Authorization Code flow with PKCE, so credentials are only ever exchanged with Google — never typed into Pi.

1. `/login antigravity` opens Google sign-in and starts a temporary callback listener at `http://localhost:51121/oauth-callback`.
2. After you approve access, Pi exchanges the callback code for tokens and stores the provider credentials in Pi's auth store (normally `~/.pi/agent/auth.json`).
3. Pi refreshes access tokens automatically when they expire — you shouldn't need to sign in again unless a token is revoked.

The callback listener binds only to a loopback host, so it isn't reachable from outside your machine. The auth file it writes to contains sensitive access and refresh tokens: **do not commit it, paste it into issues, or share its contents.**

Signing in requests these Google OAuth scopes:

| Scope                                | Why it's needed                                                           |
| ------------------------------------ | ------------------------------------------------------------------------- |
| `aicode`                             | Access to the Cloud Code Assist / Antigravity model catalog and endpoints |
| `cloud-platform`                     | General Cloud Code Assist API access                                      |
| `userinfo.email`, `userinfo.profile` | Identify the signed-in Google account                                     |
| `cclog`                              | Cloud Code Assist logging/telemetry endpoints used by the API             |
| `experimentsandconfigs`              | Server-side experiment and config flags for the API                       |

Review these permissions before approving access. If your credentials expire or are revoked, just re-run `/login antigravity` to sign in again.

## Multiple accounts

Pi stores exactly one credential per provider ID, so this extension registers several
Antigravity provider IDs — one per account slot. Slot 1 keeps the plain `antigravity`
ID, and further slots are `antigravity-2`, `antigravity-3`, … Every slot shares the same
implementation, endpoints, and model routing; only the Google credential differs.

Sign in to a second account:

```text
/login antigravity-2
```

Models and the account's email appear immediately after login — no `/reload` needed. To
switch the current session between accounts:

```text
/antigravity.account                  # list slots, sign-in state, and the active one
/antigravity.account use 2            # switch to slot 2, keeping the current model
/antigravity.account use work@gmail   # or match on the account email
```

`/model antigravity-2/gemini-3.7-flash` works too, and the switch takes effect on the next
request. The footer prefixes non-primary accounts (`#2`) so it is clear which quota is being
spent. Quota, entitlement, and the model catalog are per account, so each slot caches its own
catalog (`~/.pi/agent/antigravity-models-cache.antigravity-2.json`; slot 1 keeps the original
`antigravity-models-cache.json`).

Slots you have not signed in to register no models, so they stay out of `/model` while
remaining available to `/login`. Set `ANTIGRAVITY_ACCOUNTS` to change how many slots are
registered (1–8, default 3).

Two caveats:

- After `/logout antigravity-2`, that slot's models stay listed until Pi restarts. Pi marks
  them unavailable, so selecting one fails cleanly rather than sending a request.
- Switching accounts does not migrate conversation state; it only changes which credential
  and quota the next request uses.

## Usage and status bar display

The extension keeps you informed about your Google Cloud Code Assist quota consumption without interrupting your flow.

### Status bar quota line

When an Antigravity model is active, the footer status bar automatically shows the current account's quota consumption:

```text
Gemini 5h:17.2% w:6.2% · Opus 5h:99.3% w:34.2%
```

- **Account Tag**: Secondary account slots show a prefix such as `#2 ` or `#2 work `, so you always know which account is being charged.
- **5h Window**: Rolling 5-hour quota consumption percentage.
- **Weekly Window (`w:`)**: Rolling 7-day quota consumption percentage.
- **Auto-Refresh**: Updated automatically at session start, turn end, model switch, and after `/antigravity.usage` or `/antigravity.models`.

### Controlling Opus / 3P visibility in the status bar

If you only want to track Gemini quota in your status bar and hide Claude/Opus usage, configure `statusShowOpus`:

- In `~/.pi/agent/settings.json` (global) or `.pi/settings.json` (project):
  ```json
  {
    "antigravity": {
      "statusShowOpus": false
    }
  }
  ```
- Or via environment variable:
  ```bash
  export ANTIGRAVITY_STATUS_SHOW_OPUS=false   # or 0 / off / no
  ```

### Detailed quota command (`/antigravity.usage`)

Run `/antigravity.usage` to inspect full quota groups with visual progress bars and reset countdowns:

```text
Gemini Models
  [==------------------] Five Hour Limit: 17.2% used · resets in 3h 12m
  [=-------------------] Weekly Limit: 6.2% used · resets in 4d 8h

Claude and GPT models
  [====================] Five Hour Limit: 99.3% used · resets in 1h 45m
  [=======-------------] Weekly Limit: 34.2% used · resets in 2d 14h
```

## Commands

| Command                                  | Description                                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `/login antigravity`                     | Sign in to Google and configure the provider.                                                    |
| `/model antigravity/<model-id>`          | Choose a registered Antigravity model.                                                           |
| `/antigravity.account`                   | List the account slots, which are signed in, and which one this session is using.                |
| `/antigravity.account use <slot\|email>` | Switch this session to another signed-in account, keeping the current model.                     |
| `/antigravity.usage`                     | Show the server-reported shared quota groups and reset times.                                    |
| `/antigravity.models`                    | List available runtime models, used shared-pool quota, and capabilities.                         |
| `/antigravity.models sync`               | Re-sync the model catalog from the backend, then list.                                           |
| `/antigravity.models all`                | Include tab/chat models normally hidden from the model list.                                     |
| `/antigravity.doctor`                    | Show sanitized provider diagnostics, including the endpoint, status, and resolved runtime model. |

Model availability, entitlement, quota groups, and resets are returned by the service and can differ by account. The quota percentage shown for a model can represent a shared pool, not a private per-model allowance.

## Models and routing

The static model IDs registered by this extension match the Antigravity CLI catalog (`agy models`). Use `/antigravity.models` to see live availability and quota for your account — the table below is a reference for what each public model ID maps to.

New model families advertised by the backend are picked up automatically: on every session start (and via `/antigravity.models sync`) the extension fetches the live catalog and registers unknown runtime families as selectable models, deriving their thinking levels from the advertised tiers. The seven curated models below keep their hand-tuned routing; offline or on fetch failure the extension falls back to them.

`agy models` advertises display entries across Gemini Flash (3.7, 3.6, 3.5), Gemini Pro, Claude Sonnet/Opus Thinking, and GPT-OSS Medium. Pi collapses those into seven public model IDs, each showing only the thinking level(s) that model advertises.

### Why Claude and GPT-OSS appear

Antigravity / Cloud Code Assist exposes a multi-provider catalog. Depending on your account, its Google-authenticated API can advertise Google Gemini models alongside Claude models served through Anthropic Vertex and GPT-OSS served through OpenAI Vertex. This extension intentionally exposes those advertised Claude and GPT-OSS models through the single `antigravity` provider; they are not separate Pi providers and do not use a separate Anthropic or OpenAI login.

The backend's display labels do not always match its runtime IDs. For example, `gemini-3.5-flash-extra-low`, `gemini-3.5-flash-low`, and `gemini-3-flash-agent` can be displayed as Gemini 3.5 Flash Low, Medium, and High. Gemini 3.6 and 3.7 Flash use per-effort runtime IDs and send `thinkingLevel`; Gemini 3.5 Flash and 3.1 Pro send `thinkingBudget`.

| Public model ID     | Input       | Thinking levels shown | Max output tokens | Request routing                                                                                    |
| ------------------- | ----------- | --------------------- | ----------------- | -------------------------------------------------------------------------------------------------- |
| `gemini-3.7-flash`  | Text, image | Low, Medium, High     | 65,536            | low → `gemini-3.7-flash-low`; medium → `gemini-3.7-flash-medium`; high → `gemini-3.7-flash-high`   |
| `gemini-3.6-flash`  | Text, image | Low, Medium, High     | 65,536            | low → `gemini-3.6-flash-low`; medium → `gemini-3.6-flash-medium`; high → `gemini-3.6-flash-high`   |
| `gemini-3.5-flash`  | Text, image | Low, Medium, High     | 65,536            | low → `gemini-3.5-flash-extra-low`; medium → `gemini-3.5-flash-low`; high → `gemini-3-flash-agent` |
| `gemini-3.1-pro`    | Text, image | Low, High             | 65,535            | low → `gemini-3.1-pro-low`; high → `gemini-pro-agent`                                              |
| `claude-sonnet-4-6` | Text, image | High                  | 64,000            | high → `claude-sonnet-4-6`                                                                         |
| `claude-opus-4-6`   | Text, image | High                  | 64,000            | high → `claude-opus-4-6-thinking`                                                                  |
| `gpt-oss-120b`      | Text        | Medium                | 32,768            | medium → `gpt-oss-120b-medium`                                                                     |

To limit which models Pi cycles through, enable specific entries in `~/.pi/agent/settings.json`:

```json
{
  "models": {
    "antigravity/gemini-3.7-flash": { "enabled": true },
    "antigravity/gemini-3.6-flash": { "enabled": true },
    "antigravity/gemini-3.5-flash": { "enabled": true },
    "antigravity/gemini-3.1-pro": { "enabled": true },
    "antigravity/claude-sonnet-4-6": { "enabled": true }
  }
}
```

## Configuration

All primary environment variables start with `ANTIGRAVITY_`. The legacy `NOAGY_` prefix is also accepted for compatibility.

| Variable                       | Purpose                                                                                                                                                                                |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ANTIGRAVITY_BASE_URL`         | Override the API base URL. It must be HTTPS, contain no URL credentials, and target an allowed Google APIs host.                                                                       |
| `ANTIGRAVITY_PROJECT_ID`       | Use a specific Cloud Code Assist project ID instead of discovery or the stable account fallback.                                                                                       |
| `ANTIGRAVITY_ACCOUNTS`         | How many account slots to register, 1–8 (default 3). See [Multiple accounts](#multiple-accounts).                                                                                      |
| `ANTIGRAVITY_CALLBACK_HOST`    | Bind OAuth callback to `127.0.0.1`, `::1`, or `localhost` only. Defaults to `127.0.0.1`.                                                                                               |
| `ANTIGRAVITY_USER_AGENT`       | Override the request user-agent.                                                                                                                                                       |
| `ANTIGRAVITY_RUNTIME_MODEL`    | Pin requests to a runtime model ID, bypassing normal static routing.                                                                                                                   |
| `ANTIGRAVITY_CLIENT_ID`        | Use a custom Google OAuth client ID.                                                                                                                                                   |
| `ANTIGRAVITY_CLIENT_SECRET`    | Use a custom Google OAuth client secret. Keep it out of source control and shell history.                                                                                              |
| `ANTIGRAVITY_NO_KEEPALIVE`     | Set to `1` to skip the keep-alive connection pool.                                                                                                                                     |
| `ANTIGRAVITY_NO_PREWARM`       | Set to `1` to skip the TLS pre-warm request made when the extension loads.                                                                                                             |
| `ANTIGRAVITY_STATUS_SHOW_OPUS` | Set to `0` or `false` to hide Opus usage in the status bar (default `true`). Also configurable via `antigravity.statusShowOpus` in `~/.pi/agent/settings.json` or `.pi/settings.json`. |

By default, the provider tries `https://daily-cloudcode-pa.googleapis.com`, then the sandbox host, then `https://cloudcode-pa.googleapis.com`. Prefer the built-in OAuth client unless you have a reason to use your own credentials.

### Latency

Provider requests reuse a keep-alive connection pool when the runtime supports it, so consecutive turns do not repeat the DNS, TCP, and TLS handshake. When `HTTP_PROXY`, `HTTPS_PROXY`, or `ALL_PROXY` is set, that pool is skipped so Pi's proxy-aware dispatcher is used instead. The connection is also opened when the extension loads so the first message of a session skips the handshake too. For the lowest time-to-first-token, pick a fast runtime: `gemini-3.7-flash` with reasoning off routes to `gemini-3.7-flash-low` at thinking level `LOW`. Setting `ANTIGRAVITY_PROJECT_ID` also removes the project-discovery round-trip when credentials do not already carry a project ID.

## Troubleshooting

- **No credentials / 401 / 403:** Run `/login antigravity` again, then check `/antigravity.doctor`.
- **Remote/headless machine — browser can't reach `localhost:51121`:** The callback binds to loopback only, so a browser on another machine can't hit it. You have two options:
  - **Paste (no extra setup):** Run `/login antigravity`, open the shown URL and complete Google sign-in in _any_ browser. When it redirects to `http://localhost:51121/oauth-callback?…` and fails to load, copy that full URL from the address bar and paste it into the prompt Pi shows. The code is single-use and expires quickly, so paste promptly.
  - **SSH tunnel (reusable):** From the machine with the browser, run `ssh -N -L 51121:127.0.0.1:51121 <user>@<server>` and keep it open, then run `/login antigravity` on the server. The redirect to `localhost:51121` tunnels through to the local callback automatically.
- **OAuth callback will not start:** Ensure port `51121` is free and `ANTIGRAVITY_CALLBACK_HOST` is a permitted loopback address.
- **Model is unavailable:** Run `/antigravity.models`; availability is account- and service-dependent.
- **A second account shows no models:** Run `/login antigravity-2` (or the slot you want) and check `/antigravity.account`. Slots with no credential deliberately register no models.
- **Claude/GPT tool-call schema error:** Upgrade to the latest package release. The provider adapts Pi's JSON Schema tool definitions for the Cloud Code Assist custom-tool bridge.
- **Quota or rate limit:** Run `/antigravity.usage`. A `429` response usually indicates quota or rate limiting; changing models may still draw from the same shared pool.
- **Need a safe diagnostic:** `/antigravity.doctor` redacts recognized secrets from its error output. Still review output before sharing it publicly.

## Development

This repo uses [Bun](https://bun.sh) for install, scripts, and CI. The published extension itself runs on Node (Pi's CLI).

```bash
bun install
bun run check
```

The package declares its Pi extension in `package.json` under `pi.extensions`. See the [Pi package documentation](https://pi.dev/docs/latest/packages) for package installation, manifest, and gallery conventions.

## License

[MIT](LICENSE)
