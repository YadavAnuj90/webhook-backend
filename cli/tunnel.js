#!/usr/bin/env node
/**
 * WebhookOS CLI Tunnel
 * Usage: node cli/tunnel.js --token <JWT> --port 3000 --api https://api.yourapp.com
 *
 * Connects to the SSE tunnel and forwards all incoming webhooks to localhost.
 */
const http = require('http');
const https = require('https');
const { URL } = require('url');

const args = process.argv.slice(2);
const get = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };

const TOKEN = get('--token');
const LOCAL_PORT = parseInt(get('--port') || '3000');
const LOCAL_PATH = get('--path') || '/';
const API_BASE = (get('--api') || 'http://localhost:3000').replace(/\/$/, '');

if (!TOKEN) { console.error('❌  --token <JWT> is required'); process.exit(1); }

async function createTunnel() {
  // 1. Create tunnel session
  const createUrl = `${API_BASE}/api/v1/tunnel/create`;
  const protocol = createUrl.startsWith('https') ? https : http;
  const body = JSON.stringify({});

  const tunnelData = await new Promise((resolve, reject) => {
    const u = new URL(createUrl);
    const req = protocol.request({
      hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}`, 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });

  console.log(`\n🚇  WebhookOS Tunnel active`);
  console.log(`📡  Inbound URL : ${tunnelData.inboundUrl}`);
  console.log(`🏠  Forwarding  : → http://localhost:${LOCAL_PORT}${LOCAL_PATH}`);
  console.log(`\n   Send webhooks to the Inbound URL above.\n`);

  // 2. Connect to SSE stream
  const sseUrl = new URL(tunnelData.sseUrl);
  const sseProtocol = sseUrl.protocol === 'https:' ? https : http;

  const connect = () => {
    const req = sseProtocol.request({
      hostname: sseUrl.hostname,
      port: sseUrl.port || (sseUrl.protocol === 'https:' ? 443 : 80),
      path: sseUrl.pathname,
      method: 'GET',
      headers: { 'Accept': 'text/event-stream', 'Cache-Control': 'no-cache' },
    }, (res) => {
      let buf = '';
      res.on('data', (chunk) => {
        buf += chunk.toString();
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6));
              if (event.type === 'connected') { console.log(`✅  SSE connected (tunnelId: ${event.tunnelId})\n`); continue; }
              forwardToLocal(event);
            } catch {}
          }
        }
      });
      res.on('end', () => { console.log('⚠️  SSE disconnected, reconnecting in 3s...'); setTimeout(connect, 3000); });
    });
    req.on('error', (e) => { console.error('SSE error:', e.message, '— reconnecting in 3s...'); setTimeout(connect, 3000); });
    req.end();
  };

  connect();
}

function forwardToLocal(event) {
  const body = JSON.stringify(event.body || {});
  const localProtocol = http;
  const req = localProtocol.request({
    hostname: 'localhost', port: LOCAL_PORT, path: LOCAL_PATH,
    method: event.method || 'POST',
    headers: {
      ...event.headers,
      'host': `localhost:${LOCAL_PORT}`,
      'content-length': Buffer.byteLength(body),
    },
  }, (res) => {
    console.log(`→ ${event.method} ${LOCAL_PATH} → ${res.statusCode}`);
  });
  req.on('error', (e) => console.error(`❌  Forward error: ${e.message}`));
  req.write(body);
  req.end();
}

createTunnel().catch((e) => { console.error('Fatal:', e.message); process.exit(1); });
