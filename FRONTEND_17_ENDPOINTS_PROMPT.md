# Frontend Integration — 17 New API Endpoints

## Context
Backend base URL: `http://localhost:3000/api/v1`
Auth: `Authorization: Bearer <accessToken>` on all routes marked 🔐
The `accessToken` comes from `POST /auth/login` or `POST /auth/register`.

**Your task:** For each of the 17 endpoints below, check if it is already called anywhere in the frontend codebase (API service files, hooks, components, store actions). If it is NOT mapped yet, add it — create the API function, hook, and wire it to the relevant UI component/page. Follow the existing axios/fetch/react-query patterns already in the codebase.

---

## Module 1 — Playground (`/api/v1/playground`)

### 1. `POST /api/v1/playground/fire` 🔐
Fire a real HTTP request to any URL and inspect the response. Used on the **Playground / Test Delivery** page.

**Request:**
```json
{
  "url": "https://webhook.site/abc123",
  "method": "POST",
  "headers": { "X-Custom-Header": "value" },
  "payload": { "event": "user.created", "data": { "id": "123" } },
  "timeout": 10000
}
```
**Response `200`:**
```json
{
  "success": true,
  "status": 200,
  "statusText": "OK",
  "body": "<response body>",
  "headers": { "content-type": "application/json" },
  "latency": 142,
  "curl": "curl -X POST 'https://...' -H 'Content-Type: application/json' -d '{...}'",
  "sentAt": "2026-01-01T00:00:00.000Z"
}
```
On network failure: `{ "success": false, "status": 0, "latency": 5000, "error": "Request timed out" }`

**UI wiring:** "Send Request" button on Playground page → show response status badge, latency, headers table, body preview, copy-curl button.

---

### 2. `POST /api/v1/playground/validate-signature` 🔐
Validate an HMAC-SHA256 webhook signature. Used on the **Playground / Signature Validator** tab.

**Request:**
```json
{
  "payload": "raw string of the webhook body",
  "signature": "sha256=abcdef1234...",
  "secret": "my-webhook-secret"
}
```
**Response `200`:**
```json
{
  "valid": true,
  "expected": "sha256=abcdef1234..."
}
```
Or if invalid: `{ "valid": false, "expected": "sha256=..." }`

**UI wiring:** Signature validator form → show green ✅ / red ❌ badge + expected hash value.

---

## Module 2 — Transformations (`/api/v1/transformations`)

### 3. `GET /api/v1/transformations` 🔐
List all transformation rules for the authenticated user.

**Response `200`:**
```json
[
  {
    "_id": "abc123",
    "name": "Flatten payload",
    "description": "Removes nested keys",
    "type": "custom_js",
    "config": {},
    "isActive": true,
    "createdAt": "2025-01-01T00:00:00.000Z"
  }
]
```

---

### 4. `POST /api/v1/transformations` 🔐
Create a new transformation rule.

**Request:**
```json
{
  "name": "Flatten payload",
  "description": "Removes nested keys",
  "type": "remove_fields",
  "config": { "fields": ["metadata", "debug"] },
  "isActive": true
}
```
**Response `201`:** Created transformation object.

---

### 5. `PUT /api/v1/transformations/:id` 🔐
Update a transformation rule (owner only).

**Request:** Same shape as POST, all fields optional (partial update).
**Response `200`:** Updated transformation object.
**Error `404`:** Not found / not owned.

---

### 6. `DELETE /api/v1/transformations/:id` 🔐
Delete a transformation rule (owner only).

**Response `200`:** `{ "success": true }`
**Error `404`:** Not found / not owned.

---

### 7. `POST /api/v1/transformations/preview` 🔐
Preview/test a transformation against a sample payload. Used on the Transformation editor's **Test** panel.

**Request:**
```json
{
  "transformation": {
    "type": "remove_fields",
    "config": { "fields": ["password", "token"] }
  },
  "payload": { "userId": "123", "password": "secret", "token": "tok_abc" }
}
```
**Response `200`:**
```json
{
  "input": { "userId": "123", "password": "secret", "token": "tok_abc" },
  "output": { "userId": "123" },
  "dropped": false
}
```
If transformation causes a drop (filter rule no match): `{ "dropped": true, "output": null }`

**UI wiring:** "Test" button in transformation editor → show input/output JSON side by side, highlight diff, show "DROPPED" badge if dropped.

---

## Module 3 — Portal Tokens (`/api/v1/portal`)

### 8. `GET /api/v1/portal/tokens` 🔐
List all portal tokens for the authenticated user.

**Response `200`:**
```json
[
  {
    "_id": "tok_abc123",
    "token": "pt_xxxxx",
    "projectId": "proj_123",
    "customerName": "Acme Corp",
    "customerEmail": "webhooks@acme.com",
    "expiresAt": "2026-12-31T00:00:00.000Z",
    "brandColor": "#6366f1",
    "primaryColor": "#6366f1",
    "logoUrl": "https://acme.com/logo.png",
    "isActive": true,
    "customDomain": "webhooks.acme.com",
    "subscribedEventTypes": ["user.created", "payment.completed"],
    "createdAt": "2025-01-01T00:00:00.000Z"
  }
]
```

---

### 9. `POST /api/v1/portal/tokens` 🔐
Create a portal token with full branding config.

**Request:**
```json
{
  "projectId": "proj_123",
  "customerName": "Acme Corp",
  "customerEmail": "webhooks@acme.com",
  "expiresAt": "2026-12-31T00:00:00.000Z",
  "logoUrl": "https://acme.com/logo.png",
  "brandColor": "#6366f1",
  "primaryColor": "#6366f1",
  "secondaryColor": "#a855f7",
  "companyName": "Acme Corporation",
  "faviconUrl": "https://acme.com/favicon.ico",
  "fontFamily": "Inter, sans-serif",
  "darkMode": false,
  "customDomain": "webhooks.acme.com",
  "supportEmail": "support@acme.com",
  "portalTitle": "Acme Webhook Portal"
}
```
**Response `201`:** Created token object (includes `token: "pt_xxxxx"` field — show this to the user once, it can't be retrieved again).

---

### 10. `PATCH /api/v1/portal/tokens/:id/revoke` 🔐
Revoke a portal token (sets `isActive: false`).

**Response `200`:** Updated token object with `isActive: false`.
**Error `404`:** Not found / not owned.

---

### 11. `DELETE /api/v1/portal/tokens/:id` 🔐
Permanently delete a portal token.

**Response `200`:** `{ "success": true }`
**Error `404`:** Not found / not owned.

---

### 12. `PATCH /api/v1/portal/tokens/:id/branding` 🔐
Update branding for a portal token.

**Request (all fields optional):**
```json
{
  "logoUrl": "https://newlogo.com/logo.png",
  "primaryColor": "#a855f7",
  "secondaryColor": "#7c3aed",
  "companyName": "Acme Corp",
  "faviconUrl": "https://acme.com/new-favicon.ico",
  "fontFamily": "Poppins, sans-serif",
  "darkMode": true,
  "customDomain": "webhooks.acme.com",
  "supportEmail": "support@acme.com",
  "portalTitle": "Acme Portal",
  "customCss": ".portal-header { background: #1a1a2e; }"
}
```
**Response `200`:** Updated token object.

---

### 13. `GET /api/v1/portal/domain/:domain` ❌ PUBLIC (no auth)
Look up portal branding by custom domain. Called by the customer-facing portal iframe at load time.

**Example:** `GET /api/v1/portal/domain/webhooks.acme.com`

**Response `200`:**
```json
{
  "projectId": "proj_123",
  "customerName": "Acme Corp",
  "companyName": "Acme Corporation",
  "logoUrl": "https://acme.com/logo.png",
  "faviconUrl": "https://acme.com/favicon.ico",
  "primaryColor": "#6366f1",
  "secondaryColor": "#a855f7",
  "fontFamily": "Inter, sans-serif",
  "darkMode": false,
  "supportEmail": "support@acme.com",
  "portalTitle": "Acme Webhook Portal",
  "customCss": null,
  "socialLinks": {},
  "valid": true
}
```
**Error `404`:** `{ "message": "No portal configured for this domain" }`

**UI wiring:** Customer portal page loads this on mount and applies branding dynamically.

---

### 14. `PATCH /api/v1/portal/tokens/:id/subscriptions` 🔐
Update which event types a customer portal is subscribed to.

**Request:**
```json
{
  "subscribedEventTypes": ["user.created", "payment.completed", "order.shipped"]
}
```
**Response `200`:** Updated token object.

---

## Module 4 — Usage (`/api/v1/usage`)

### 15. `GET /api/v1/usage?period=day|week|month` 🔐
Get usage stats for the given period. Default: `month`.

**Query params:** `period` = `day` | `week` | `month`

**Response `200`:**
```json
{
  "period": "month",
  "plan": "pro",
  "limits": { "events": 1000000, "endpoints": 50, "projects": 10, "retention": 90 },
  "totals": {
    "total": 1240,
    "delivered": 1190,
    "failed": 45,
    "pending": 5
  },
  "chart": [
    { "date": "2026-01-01", "delivered": 120, "failed": 3, "pending": 0 },
    { "date": "2026-01-02", "delivered": 98,  "failed": 2, "pending": 1 }
  ],
  "overage": {
    "events": 240,
    "estimatedCost": 0.06,
    "currency": "USD"
  },
  "bandwidth": { "bytes": 1269760, "requests": 1240 },
  "topEndpoints": []
}
```

**UI wiring:** Usage / Analytics page → period selector tabs (Day/Week/Month) → line/bar chart from `chart` array → totals cards → overage warning banner if `overage.events > 0`.

---

### 16. `GET /api/v1/usage/summary` 🔐
Quick summary: this month vs last month + current plan limits.

**Response `200`:**
```json
{
  "plan": "pro",
  "limits": { "events": 1000000, "endpoints": 50, "projects": 10, "retention": 90 },
  "thisMonth": {
    "events": 1240,
    "delivered": 1190,
    "failed": 45,
    "successRate": 95.97
  },
  "lastMonth": {
    "events": 980,
    "delivered": 950,
    "failed": 30,
    "successRate": 96.94
  },
  "percentUsed": { "events": 0.12 },
  "overage": { "events": 0, "estimatedCost": 0, "currency": "USD" }
}
```

**UI wiring:** Dashboard summary cards → "This Month" vs "Last Month" comparison, plan usage progress bar (`percentUsed.events`), overage cost if applicable.

---

## Module 5 — Metrics (`/api/v1/metrics`)

### 17. `GET /api/v1/metrics` 🔐
Returns Prometheus text format metrics. For the **Metrics / Observability** dashboard page.

**Note:** Response `Content-Type` is `text/plain; version=0.0.4; charset=utf-8` — NOT JSON. Parse it manually.

**Response body (text/plain):**
```
# HELP webhook_delivered_total Total webhook events successfully delivered
# TYPE webhook_delivered_total counter
webhook_delivered_total{project_id="...",endpoint_id="...",event_type="..."} 45231

# HELP webhook_failed_total Total webhook delivery failures
# TYPE webhook_failed_total counter
webhook_failed_total 1203

# HELP webhook_dlq_size Current number of events in Dead Letter Queue
# TYPE webhook_dlq_size gauge
webhook_dlq_size 8

# HELP webhook_active_endpoints Number of active webhook endpoints
# TYPE webhook_active_endpoints gauge
webhook_active_endpoints 12

# HELP webhook_delivery_duration_ms Webhook delivery latency in milliseconds
# TYPE webhook_delivery_duration_ms histogram
webhook_delivery_duration_ms_bucket{le="100"} 2345

# HELP process_heap_bytes Node.js heap memory used
# TYPE process_heap_bytes gauge
process_heap_bytes 48234496

# HELP process_uptime_seconds Process uptime in seconds
# TYPE process_uptime_seconds counter
process_uptime_seconds 86400
```

**Frontend parsing — simple regex parser:**
```javascript
function parsePrometheusText(text) {
  const metrics = {};
  const lines = text.split('\n');
  for (const line of lines) {
    if (line.startsWith('#') || !line.trim()) continue;
    const match = line.match(/^(\w+)(?:\{[^}]*\})?\s+([\d.e+\-]+)/);
    if (match) {
      const [, name, value] = match;
      if (!metrics[name]) metrics[name] = 0;
      metrics[name] += parseFloat(value);
    }
  }
  return metrics;
}
```

**UI wiring:** Metrics page → call this endpoint, parse the text, display:
- `webhook_delivered_total` → "Total Delivered" counter card
- `webhook_failed_total` → "Total Failed" counter card
- `webhook_dlq_size` → "DLQ Size" gauge card
- `webhook_active_endpoints` → "Active Endpoints" gauge card
- `process_heap_bytes` → memory usage bar
- `process_uptime_seconds` → uptime display

---

## Summary Checklist

Go through your frontend codebase and for each item below mark ✅ if already called, ❌ if missing:

| # | Method | Route | Page / Component |
|---|--------|-------|-----------------|
| 1 | POST | `/playground/fire` | Playground → Test Delivery form |
| 2 | POST | `/playground/validate-signature` | Playground → Signature Validator |
| 3 | GET | `/transformations` | Transformations list page |
| 4 | POST | `/transformations` | Create transformation modal |
| 5 | PUT | `/transformations/:id` | Edit transformation modal |
| 6 | DELETE | `/transformations/:id` | Delete transformation button |
| 7 | POST | `/transformations/preview` | Transformation editor test panel |
| 8 | GET | `/portal/tokens` | Portal tokens list page |
| 9 | POST | `/portal/tokens` | Create portal token modal |
| 10 | PATCH | `/portal/tokens/:id/revoke` | Token revoke button |
| 11 | DELETE | `/portal/tokens/:id` | Token delete button |
| 12 | PATCH | `/portal/tokens/:id/branding` | Token branding editor |
| 13 | GET | `/portal/domain/:domain` | Customer portal page (public) |
| 14 | PATCH | `/portal/tokens/:id/subscriptions` | Token event subscriptions editor |
| 15 | GET | `/usage?period=` | Usage / Analytics page |
| 16 | GET | `/usage/summary` | Dashboard summary cards |
| 17 | GET | `/metrics` | Metrics / Observability page |

For any row that is ❌, implement it following the existing API service patterns in the codebase.

---

## General Rules
1. **Base URL:** All routes are under `http://localhost:3000/api/v1` (or `VITE_API_URL` / `NEXT_PUBLIC_API_URL` env var)
2. **Auth header:** `Authorization: Bearer ${accessToken}` — use the existing auth interceptor/hook already in the codebase
3. **Error handling:** Backend returns `{ "message": "..." }` for 4xx errors — show toast/snackbar
4. **402 responses:** If any request returns HTTP 402, redirect to `/billing/upgrade` (trial expired)
5. **Loading states:** Show skeleton/spinner while requests are in-flight
6. **No new auth system needed** — reuse the existing JWT token management entirely
