# prerender/integration-contract

Wire-protocol contract + mock server for [Prerender.io](https://prerender.io) integration libraries.

## What's here

| File | Purpose |
|---|---|
| [`CONTRACT.md`](./CONTRACT.md) | The spec — what every integration MUST send to the Prerender service. |
| [`mock-server.mjs`](./mock-server.mjs) | Tiny Node HTTP server that records incoming requests and exposes inspection endpoints. ~80 lines, zero dependencies. |
| [`scenarios.json`](./scenarios.json) | Canonical conformance scenarios for integration tests. |

## Why

Every Prerender integration (Laravel, Java, ASP.NET Core, Django, Koa, Hapi, …) ships with its own unit tests that mock the upstream HTTP client and assert the **response**. None of them verify what the integration actually **sends** to Prerender — the `X-Prerender-Token` header, the URL composition, the forwarded `User-Agent`. As the integration list grows, this wire-protocol surface drifts silently.

This repo gives every integration a uniform way to verify conformance with one canonical spec.

## Using the mock server in CI

```yaml
# in your integration repo's workflow
- name: Fetch mock server
  run: curl -fsSL -o mock-server.mjs \
       https://raw.githubusercontent.com/prerender/integration-contract/main/mock-server.mjs

- name: Start mock server
  run: node mock-server.mjs &
  env:
    PORT: 9090

- name: Wait for mock
  run: |
    for i in {1..20}; do
      curl -sf http://localhost:9090/__health && break
      sleep 0.5
    done

- name: Run contract tests
  run: <your-language-specific-test-command>
```

## Mock server endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/__health` | Readiness probe — returns `{"ok": true}` |
| `GET` | `/__requests` | JSON array of all recorded requests (method, url, headers, body) |
| `POST` | `/__reset` | Clear recorded requests and restore default response |
| `POST` | `/__respond` | Configure the next response — JSON body `{status, headers, body}` |
| any | anything else | Records the request; responds with the currently-configured response (default 200 HTML) |

## Conformance test outline

For each [scenario](./scenarios.json):

1. `POST /__reset`
2. Configure your integration with `serviceUrl: http://localhost:9090/` and `token: test-token`
3. Hit your integration with the scenario's `incoming` request
4. `GET /__requests` and assert against `expectedOutgoing` (or assert the array is empty when `shouldPrerender: false`)

A reference implementation lives in [`prerender/koa`](https://github.com/prerender/koa/blob/main/test/contract.test.js).

## License

MIT
