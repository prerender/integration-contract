# Prerender Integration Contract

This document defines the wire-protocol contract that every Prerender integration library MUST satisfy. It is the single source of truth for what an integration sends to the Prerender service.

If you are writing a new Prerender integration (Express, Fastify, Rails, FastAPI, Spring, Gin, …) this is the spec to conform to. Run your integration against [`mock-server.mjs`](./mock-server.mjs) and the [`scenarios.json`](./scenarios.json) manifest to verify.

## 1. When to prerender

An integration MUST request a prerendered page from the Prerender service if **all** of the following hold:

- HTTP method is `GET`.
- A `User-Agent` request header is present and non-empty.
- The request path does **not** end with one of the [ignored static-asset extensions](#3-static-asset-extensions).
- **At least one** of:
  - The query string contains the parameter `_escaped_fragment_` (key alone is sufficient — value may be empty).
  - The request carries the header `X-Bufferbot` (any non-empty value).
  - The `User-Agent` header matches one of the [crawler user agents](#2-crawler-user-agents) (case-insensitive substring match).

Otherwise the integration MUST pass the request through to the underlying application unchanged.

## 2. Crawler user agents

Match is **case-insensitive substring**: lowercase the incoming UA and test `ua.includes(token)` for each token below.

```text
googlebot
yahoo
bingbot
baiduspider
facebookexternalhit
twitterbot
rogerbot
linkedinbot
embedly
quora link preview
showyoubot
outbrain
pinterest
slackbot
developers.google.com/+/web/snippet
w3c_validator
perplexity
oai-searchbot
chatgpt-user
gptbot
claudebot
amazonbot
```

This list is the canonical source. Integrations SHOULD copy it verbatim. New entries are added here first and propagated to integrations in a coordinated bump.

## 3. Static-asset extensions

Match is **case-insensitive suffix** on `request.path` (not the full URL — exclude query string).

```text
.js .css .xml .less .png .jpg .jpeg .gif .pdf .doc .txt .ico .rss .zip
.mp3 .rar .exe .wmv .avi .ppt .mpg .mpeg .tif .wav .mov .psd .ai .xls
.mp4 .m4a .swf .dat .dmg .iso .flv .m4v .torrent .ttf .woff .svg
```

## 4. Outgoing request to Prerender

When the integration decides to prerender (per §1), it MUST issue **exactly one** HTTP request to the Prerender service shaped as follows.

### 4.1 Method

`GET`

### 4.2 URL composition

```
{serviceUrl}/{originalScheme}://{originalHost}{originalPathAndQuery}
```

Where:

- `serviceUrl` is the configured service URL (default `https://service.prerender.io/`). Trailing slash is normalized — the integration MUST ensure exactly one `/` between `serviceUrl` and the target URL.
- `originalScheme` is the scheme of the incoming request (`http` or `https`), unless an explicit `protocol` override is configured.
- `originalHost` is the value of the incoming `Host` header.
- `originalPathAndQuery` is the request path plus query string (preserving raw encoding; query string included verbatim when non-empty, otherwise omitted entirely along with the `?`).

Example: an incoming request to `https://example.com/blog/post-1?ref=twitter` with default service URL produces:

```
GET https://service.prerender.io/https://example.com/blog/post-1?ref=twitter
```

### 4.3 Required headers

| Header | Value |
|---|---|
| `User-Agent` | The exact value of the original request's `User-Agent` header. |
| `X-Prerender-Int-Type` | The integration's canonical identifier — see §5. |

### 4.4 Optional headers

| Header | When sent | Value |
|---|---|---|
| `X-Prerender-Token` | When `token` is configured | The configured token verbatim. Omit the header entirely when unconfigured — do not send empty string. |

### 4.5 Headers the integration MUST NOT send

- `Authorization` (Prerender uses `X-Prerender-Token`, not standard auth).
- Hop-by-hop headers from the original request (`Connection`, `Transfer-Encoding`, `Keep-Alive`, etc.).
- Cookies from the original request.

### 4.6 Redirect handling

The integration MUST NOT follow redirects from the Prerender service automatically. Redirect responses (3xx) MUST be passed through to the original client with their `Location` header intact.

## 5. `X-Prerender-Int-Type` canonical values

The header value identifies which integration emitted the request, used for backend telemetry and support.

**Current convention (preserved for backwards compatibility): PascalCase, no separators.**

| Integration | Value |
|---|---|
| Laravel | `Laravel` |
| Java (Servlet Filter) | `Java` |
| ASP.NET Core | `AspNetCore` |
| Django | `Django` |
| Koa | `Koa` |
| Hapi | `Hapi` |

New integrations: pick a PascalCase identifier that names the **framework**, not the language (e.g., `Express`, `Fastify`, `Rails`, `FastAPI`, `Spring`, `Gin`, `Phoenix`). When a framework name has its own canonical casing (e.g., `FastAPI`, `AspNetCore`), preserve it.

> **Status:** this convention is documented because it reflects what is already deployed in 6 integrations. Future work may normalize to lowercase-kebab (`asp-net-core`, `fast-api`) — if so, the backend will accept both.

## 6. Response handling

The integration MUST:

- Forward the response **status code** verbatim to the original client.
- Forward the response **body** verbatim.
- Forward response headers, EXCEPT the following hop-by-hop / framework-managed headers which MUST be dropped:
  - `Content-Encoding`
  - `Content-Length`
  - `Transfer-Encoding`
  - `Connection`

### 6.1 Error handling

If the request to the Prerender service fails with a network/connection error, the integration MUST fall back to the underlying application (i.e., behave as if `shouldPrerender` had returned `false`). It MUST NOT propagate the error to the original client.

If the Prerender service returns a non-2xx, non-3xx status, the integration SHOULD forward it as-is (default). Implementations MAY expose a `softHttpCodes` opt-in that converts 4xx/5xx into either a passthrough or a custom error page.

## 7. Conformance scenarios

See [`scenarios.json`](./scenarios.json) for the canonical scenario manifest. Each scenario defines:

- An incoming request to the integration (method, path, query, headers).
- Whether the integration should prerender.
- If prerendering: the expected outgoing request to the mock (URL, headers).

To verify your integration:

1. Spawn the mock: `node mock-server.mjs` (defaults to `:9090`).
2. Configure your integration with `serviceUrl: http://localhost:9090/` and `token: test-token`.
3. For each scenario, hit your integration with the input request, then `GET http://localhost:9090/__requests` and assert the recorded outgoing request matches the expected shape.
4. Reset between scenarios with `POST http://localhost:9090/__reset`.

See [`README.md`](./README.md) for a full example.
