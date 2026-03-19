# WebhookOS API — Complete Endpoint Reference

**Base URL:** `http://localhost:3000/api/v1`
**Swagger UI:** `http://localhost:3000/api/docs`

## Authentication

All protected routes require one of:
- `Authorization: Bearer <JWT>` — from `POST /auth/login`
- `X-API-Key: whk_<key>` — from `POST /auth/api-keys`

---

## Auth  `/api/v1/auth/...`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/register` | ❌ | Register new account → auto-starts 10-day trial + sends verification email |
| POST | `/auth/login` | ❌ | Login → returns `{ accessToken, refreshToken, user }` |
| POST | `/auth/logout` | ✅ | Logout current session |
| POST | `/auth/logout-all` | ✅ | Logout all devices |
| POST | `/auth/refresh` | ❌ | Refresh access token using refreshToken |
| GET | `/auth/me` | ✅ | Get current user profile |
| GET | `/auth/sessions` | ✅ | List active login sessions |
| POST | `/auth/forgot-password` | ❌ | Request password reset email |
| POST | `/auth/reset-password` | ❌ | Reset password with token |
| POST | `/auth/change-password` | ✅ | Change password (requires current password) |
| GET | `/auth/verify-email?token=xxx` | ❌ | Verify email address (clicked from email link) |
| POST | `/auth/resend-verification` | ✅ | Resend email verification link |
| POST | `/auth/api-keys` | ✅ | Create API key |
| GET | `/auth/api-keys` | ✅ | List API keys |
| DELETE | `/auth/api-keys/:id` | ✅ | Revoke API key |

```jsonc
// POST /auth/register
{ "email": "user@example.com", "password": "secret", "firstName": "John", "lastName": "Doe" }

// POST /auth/login
{ "email": "user@example.com", "password": "secret" }

// POST /auth/api-keys
{ "name": "My Key", "scopes": ["read", "write"], "expiresAt": "2027-01-01" }
```

---

## Users  `/api/v1/users/...`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| PUT | `/users/me` | ✅ | Update my profile (firstName, lastName, phone, company, timezone) |
| PUT | `/users/me/preferences` | ✅ | Update preferences (theme, notifications) |
| GET | `/users/admin/list` | ✅ ADMIN | List all users (paginated, searchable) |
| GET | `/users/admin/stats` | ✅ ADMIN | User count stats by role/status |
| PATCH | `/users/admin/:id/role` | ✅ ADMIN | Change user role |
| PATCH | `/users/admin/:id/suspend` | ✅ ADMIN | Suspend a user account |
| PATCH | `/users/admin/:id/activate` | ✅ ADMIN | Reactivate a suspended account |

---

## Projects  `/api/v1/projects/...`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/projects` | ✅ | Create a new project |
| GET | `/projects` | ✅ | List projects you belong to |
| GET | `/projects/:id` | ✅ | Get project details |
| PUT | `/projects/:id` | ✅ | Update project (name, description, settings) |
| DELETE | `/projects/:id` | ✅ | Delete project (owner only) |
| POST | `/projects/:id/members` | ✅ | Add member to project |

---

## Endpoints  `BASE: /api/v1/projects/:projectId/endpoints`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/` | ✅ | Create endpoint (enforces plan endpoint limit) |
| GET | `/` | ✅ | List endpoints (`?page=1&limit=20&status=active`) |
| GET | `/:id` | ✅ | Get endpoint details |
| PUT | `/:id` | ✅ | Update endpoint config |
| DELETE | `/:id` | ✅ | Delete endpoint |
| POST | `/:id/rotate-secret` | ✅ | Rotate HMAC signing secret |
| PATCH | `/:id/pause` | ✅ | Pause delivery to this endpoint |
| PATCH | `/:id/resume` | ✅ | Resume delivery |

---

## Events  `BASE: /api/v1/projects/:projectId/events`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/send` | ✅ | Dispatch a webhook event (enforces monthly quota) |
| GET | `/` | ✅ | List events (`?eventType=order.created&status=failed`) |
| GET | `/dlq` | ✅ | Dead Letter Queue — events with no successful delivery |
| POST | `/dlq/replay-all` | ✅ | Replay all DLQ events |
| GET | `/:id` | ✅ | Get event details + delivery logs |
| POST | `/:id/replay` | ✅ | Replay a specific event |
| DELETE | `/erase` | ✅ | GDPR: delete all events by `?customerId=xxx` |

```jsonc
// POST /projects/:projectId/events/send
{
  "eventType": "order.created",
  "payload": { "orderId": "ord_123", "amount": 9900 },
  "customerId": "customer_abc"   // optional, for GDPR erase
}
```

---

## Webhooks  `BASE: /api/v1/projects/:projectId/webhooks`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/endpoints/:endpointId/send` | ✅ | Send event to a specific endpoint |
| POST | `/broadcast` | ✅ | Broadcast event to ALL active endpoints in project |
| GET | `/events` | ✅ | List events with filters + pagination |
| POST | `/events/:eventId/replay` | ✅ | Replay a failed/dead event |
| GET | `/events/:eventId/logs` | ✅ | All delivery log entries for an event |
| GET | `/dlq` | ✅ | Dead Letter Queue with optional filters |

---

## Analytics  `BASE: /api/v1/projects/:projectId/analytics`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/summary` | ✅ | Total events, success rate, p95 latency, failed count |
| GET | `/time-series` | ✅ | Hourly/daily delivery stats (`?period=7d`) |
| GET | `/event-types` | ✅ | Breakdown by event type |
| GET | `/heatmap` | ✅ | `[dayOfWeek][hour]` delivery activity matrix |

---

## Alerts  `BASE: /api/v1/alerts`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/` | ✅ | Create alert rule |
| GET | `/` | ✅ | List your alert rules |
| PUT | `/:id` | ✅ | Update alert rule |
| DELETE | `/:id` | ✅ | Delete alert rule |
| PATCH | `/:id/toggle` | ✅ | Enable / disable alert rule |
| POST | `/:id/test` | ✅ | Fire a test notification |

---

## Workspaces  `BASE: /api/v1/workspaces`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/` | ✅ | Create workspace |
| GET | `/` | ✅ | List workspaces you belong to |
| GET | `/:id` | ✅ | Get workspace details |
| PUT | `/:id` | ✅ | Update workspace settings |
| DELETE | `/:id` | ✅ | Delete workspace (owner only) |
| POST | `/:id/invite` | ✅ | Invite member by email |
| POST | `/invite/:token/accept` | ✅ | Accept workspace invite |
| GET | `/:id/invites` | ✅ | List pending invites |
| DELETE | `/:id/members/:uid` | ✅ | Remove member |
| PATCH | `/:id/members/:uid/role` | ✅ | Update member role |

---

## Billing  `BASE: /api/v1/billing`

### Plans & Subscription

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/billing/plans` | ✅ | List all plans (trial, starter, pro, enterprise) |
| GET | `/billing/subscription` | ✅ | My current subscription + trial status + days left |
| GET | `/billing/subscription/trial` | ✅ | Trial countdown details |
| POST | `/billing/subscription/upgrade/order` | ✅ | Create Razorpay order to upgrade plan |
| POST | `/billing/subscription/upgrade/verify` | ✅ | Verify payment signature → activates new plan |
| POST | `/billing/subscription/cancel` | ✅ | Cancel subscription |

```jsonc
// POST /billing/subscription/upgrade/order
{ "planId": "starter" }   // starter | pro | enterprise

// POST /billing/subscription/upgrade/verify
{ "orderId": "order_xxx", "paymentId": "pay_xxx", "signature": "hmac_sha256_xxx" }
```

### Invoices

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/billing/invoices` | ✅ | List all invoices |
| GET | `/billing/invoices/:id` | ✅ | Get invoice with line items |

### Credits (Pay-as-you-go)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/billing/credits/packages` | ✅ | List credit packages (₹499 → ₹12,999) |
| GET | `/billing/credits/balance` | ✅ | Current balance + lifetime stats |
| GET | `/billing/credits/transactions` | ✅ | Credit transaction history |
| POST | `/billing/credits/purchase/order` | ✅ | Create Razorpay order to buy credits |
| POST | `/billing/credits/purchase/verify` | ✅ | Verify purchase → credits added to balance |
| PATCH | `/billing/credits/auto-topup` | ✅ | Configure auto top-up |

```jsonc
// POST /billing/credits/purchase/order
{ "packageId": "pkg_id_here" }

// PATCH /billing/credits/auto-topup
{ "enabled": true, "packageId": "pkg_id_here", "threshold": 1000 }
```

### Reseller Billing (Enterprise plan required)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/billing/reseller/profile` | ✅ | Get reseller profile |
| POST | `/billing/reseller/profile` | ✅ | Create / update reseller profile |
| GET | `/billing/reseller/customers` | ✅ | List sub-customers |
| POST | `/billing/reseller/customers` | ✅ | Add customer under reseller |
| POST | `/billing/reseller/customers/:customerId/suspend` | ✅ | Suspend sub-customer |
| POST | `/billing/reseller/customers/:customerId/reactivate` | ✅ | Reactivate sub-customer |
| GET | `/billing/reseller/customers/:customerId/invoices` | ✅ | Customer's invoices |
| POST | `/billing/reseller/invoices/generate` | ✅ | Trigger monthly invoice generation |
| GET | `/billing/reseller/revenue` | ✅ | Revenue summary |
| GET | `/billing/reseller/plans` | ✅ | Custom plans you created |
| POST | `/billing/reseller/plans` | ✅ | Create custom plan for customers |

### Razorpay Webhook (no auth — HMAC verified by `x-razorpay-signature`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/billing/webhook` | ❌ HMAC | Razorpay webhook receiver — handles payment.captured, subscription.charged, payment.failed |

---

## Event Catalog  `BASE: /api/v1/projects/:projectId/event-types`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/` | ✅ | Register event type with JSON Schema |
| GET | `/` | ✅ | List all event types |
| GET | `/:id` | ✅ | Get event type + schema |
| PUT | `/:id` | ✅ | Update event type |
| DELETE | `/:id` | ✅ | Delete event type |
| POST | `/validate` | ✅ | Validate payload against schema |
| POST | `/:name/contract-test` | ✅ | CI/CD contract test (200=pass, 422=fail) |
| POST | `/:id/simulate` | ✅ | Fire simulated webhook using sample payload |

---

## Operational Webhooks  `BASE: /api/v1/projects/:projectId/operational-webhooks`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/` | ✅ | Register system-event webhook URL |
| GET | `/` | ✅ | List operational webhooks |
| PUT | `/:id` | ✅ | Update config |
| DELETE | `/:id` | ✅ | Delete |
| POST | `/:id/rotate-secret` | ✅ | Rotate HMAC secret |
| POST | `/:id/test` | ✅ | Send test operational event |

---

## AI Features  `BASE: /api/v1/ai`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/ai/status` | ✅ | Active AI provider (Gemini / DeepSeek) |
| POST | `/ai/projects/:projectId/debug` | ✅ | Natural Language Debugger |
| POST | `/ai/projects/:projectId/generate-schema` | ✅ | AI Schema Generator from sample payload |
| POST | `/ai/projects/:projectId/triage-dlq` | ✅ | Smart DLQ Triage — AI groups dead events |
| POST | `/ai/detect-pii` | ✅ | PII Detector — scan payload JSON |
| POST | `/ai/projects/:projectId/endpoints/:endpointId/detect-pii` | ✅ | PII scan scoped to endpoint |

```jsonc
// POST /ai/projects/:projectId/debug
{ "question": "Why are events to endpoint X failing with 403?" }

// POST /ai/projects/:projectId/generate-schema
{ "payload": { "userId": "u_123", "event": "order.created", "amount": 9900 } }

// POST /ai/detect-pii
{ "payload": { "email": "user@example.com", "phone": "9876543210" } }
```

---

## Dev Tunnel  `BASE: /api/v1/tunnel`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/tunnel/create` | ✅ | Create CLI tunnel → returns `{ tunnelId, url }` |
| GET | `/tunnel/sse/:tunnelId` | ❌ | SSE stream — CLI listens here for forwarded events |
| POST | `/tunnel/in/:tunnelId` | ❌ | Public inbound — point webhook senders here during dev |
| GET | `/tunnel/status/:tunnelId` | ❌ | Check if CLI tunnel is active |

---

## API Keys  `BASE: /api/v1/api-keys`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/` | ✅ | Create API key |
| GET | `/` | ✅ | List API keys |
| GET | `/stats` | ✅ | API key usage stats |
| PATCH | `/:id/revoke` | ✅ | Revoke key |
| DELETE | `/:id` | ✅ | Delete key permanently |

---

## Audit Log  `BASE: /api/v1/audit`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/audit/me` | ✅ | My own activity history |
| GET | `/audit/system` | ✅ ADMIN | System-wide audit log |
| GET | `/audit/export` | ✅ ADMIN | Export audit logs as CSV |

---

## Search  `BASE: /api/v1/search`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/search?q=xxx` | ✅ | Global full-text search across events, endpoints, projects |

---

## Health & Metrics  (no auth required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/health` | Full health check (MongoDB, Redis) |
| GET | `/api/v1/health/liveness` | Kubernetes liveness probe |
| GET | `/api/v1/health/readiness` | Kubernetes readiness probe |
| GET | `/api/v1/metrics` | Prometheus metrics scrape endpoint |

---

## Common Error Responses

```jsonc
// 400 Bad Request
{ "statusCode": 400, "message": "Validation error" }

// 401 Unauthorized
{ "statusCode": 401, "message": "Unauthorized" }

// 402 Payment Required (trial expired / subscription required)
{ "statusCode": 402, "code": "TRIAL_EXPIRED", "message": "Your 10-day trial expired. Please upgrade." }

// 403 Forbidden (quota exceeded)
{ "statusCode": 403, "message": "Monthly event limit reached (50,000). Upgrade your plan." }

// 404 Not Found
{ "statusCode": 404, "message": "Resource not found" }

// 409 Conflict
{ "statusCode": 409, "message": "Email already registered" }

// 500 Internal Server Error
{ "statusCode": 500, "message": "Internal server error" }
```

### HTTP 402 codes (from SubscriptionGuard):
- `TRIAL_EXPIRED` — trial ended, upgrade required
- `SUBSCRIPTION_SUSPENDED` — payment overdue
- `SUBSCRIPTION_CANCELLED` — user cancelled

---

## Subscription Status Flow

```
Register → TRIAL (10 days)
         ↓ expired
      TRIAL_EXPIRED
         ↓ buy credits
      CREDIT_ONLY ← pay-as-you-go users
         ↓ upgrade plan
         ACTIVE
         ↓ payment fails
       PAST_DUE → SUSPENDED
         ↓ cancel
      CANCELLED
```

---

## Plan Limits

| Plan | Events/Month | Endpoints | AI Features | Reseller | Price |
|------|-------------|-----------|-------------|---------|-------|
| Trial (10 days) | 5,000 | 5 | ❌ | ❌ | Free |
| Starter | 50,000 | 20 | ❌ | ❌ | ₹2,499/mo |
| Pro | 500,000 | 100 | ✅ | ❌ | ₹8,299/mo |
| Enterprise | Unlimited | Unlimited | ✅ | ✅ | ₹33,299/mo |

---

## Required Environment Variables

```env
# App
PORT=3000
NODE_ENV=production
FRONTEND_URL=http://localhost:3001

# Database
MONGODB_URI=mongodb://localhost:27017/webhookos
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-jwt-secret-min-32-chars
JWT_REFRESH_SECRET=your-refresh-secret-min-32-chars
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Razorpay
RAZORPAY_KEY_ID=rzp_test_xxx
RAZORPAY_KEY_SECRET=xxx
RAZORPAY_WEBHOOK_SECRET=xxx

# SMTP (for billing emails — trial warnings, invoices, verification)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASS=app-password
FROM_EMAIL=noreply@webhookos.io

# AI (at least one required for AI features)
GEMINI_API_KEY=AIzaSy...
DEEPSEEK_API_KEY=sk-xxx
AI_PROVIDER=gemini    # gemini | deepseek

# Sentry (optional — run: npm install @sentry/node)
SENTRY_DSN=https://xxx@sentry.io/yyy
```

---

*Total endpoints: ~130 | Last updated: 2026-03-15*
