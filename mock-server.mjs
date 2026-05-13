#!/usr/bin/env node
// Prerender integration contract — mock server.
// Records every incoming request and exposes inspection endpoints.
// Spec: ./CONTRACT.md
//
// Usage:
//   node mock-server.mjs                # listen on :9090
//   PORT=8080 node mock-server.mjs      # listen on :8080
//
// Inspection endpoints:
//   GET    /__health      → 200 ok (readiness probe)
//   GET    /__requests    → JSON array of recorded requests
//   POST   /__reset       → clear recorded requests + restore default response
//   POST   /__respond     → JSON body {status, headers, body} — next prerender response
//
// Default response to any other path: 200 text/html "<html><body>prerendered</body></html>".

import http from 'node:http';

const PORT = Number(process.env.PORT) || 9090;
const DEFAULT_BODY = '<html><body>prerendered</body></html>';
const DEFAULT_RESPONSE = Object.freeze({
  status: 200,
  headers: { 'content-type': 'text/html' },
  body: DEFAULT_BODY,
});

let recorded = [];
let nextResponse = { ...DEFAULT_RESPONSE };

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  if (req.url === '/__health' && req.method === 'GET') {
    return sendJson(res, 200, { ok: true });
  }

  if (req.url === '/__requests' && req.method === 'GET') {
    return sendJson(res, 200, recorded);
  }

  if (req.url === '/__reset' && req.method === 'POST') {
    recorded = [];
    nextResponse = { ...DEFAULT_RESPONSE };
    return sendJson(res, 200, { reset: true });
  }

  if (req.url === '/__respond' && req.method === 'POST') {
    const body = await readBody(req);
    try {
      const parsed = JSON.parse(body);
      nextResponse = {
        status: parsed.status ?? 200,
        headers: parsed.headers ?? { 'content-type': 'text/html' },
        body: parsed.body ?? '',
      };
      return sendJson(res, 200, { configured: true });
    } catch (err) {
      return sendJson(res, 400, { error: 'invalid JSON body' });
    }
  }

  // Record + respond to any other request as the prerender service would.
  const body = await readBody(req);
  recorded.push({
    method: req.method,
    url: req.url,
    headers: req.headers,
    body,
    receivedAt: new Date().toISOString(),
  });

  res.writeHead(nextResponse.status, nextResponse.headers);
  res.end(nextResponse.body);
});

server.listen(PORT, () => {
  console.log(`prerender mock listening on http://localhost:${PORT}`);
});

const shutdown = () => server.close(() => process.exit(0));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
