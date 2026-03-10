# WebhookOS Backend v3

## New Features

| Module | Features |
|---|---|
| **Auth** | Register, login, logout, logout-all, refresh tokens, sessions, forgot/reset/change password |
| **API Keys** | SHA-256 hashed, scoped, expiry, usage counter, revoke |
| **RBAC** | 4 roles: `super_admin > admin > developer > viewer`, hierarchy-based guard |
| **Audit Log** | Every action logged: auth, endpoints, events, users, billing. 1-year TTL. |
| **Search** | Global search across endpoints, events, users (admin), audit actions |
| **Payments** | Stripe checkout sessions, billing portal, invoices, payment methods, cancel, webhook handler |
| **Users Admin** | List/search/filter users, change role, suspend/activate, stats by role+plan |
| **Sessions** | Track active sessions per device+IP, invalidate on logout/password change |

## API Endpoints

### Auth
```
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/logout
POST /api/v1/auth/logout-all
POST /api/v1/auth/refresh
GET  /api/v1/auth/me
GET  /api/v1/auth/sessions
POST /api/v1/auth/forgot-password
POST /api/v1/auth/reset-password
POST /api/v1/auth/change-password
POST /api/v1/auth/api-keys
GET  /api/v1/auth/api-keys
DEL  /api/v1/auth/api-keys/:id
```

### Users (Admin)
```
PUT   /api/v1/users/me
PUT   /api/v1/users/me/preferences
GET   /api/v1/users/admin/list
GET   /api/v1/users/admin/stats
PATCH /api/v1/users/admin/:id/role
PATCH /api/v1/users/admin/:id/suspend
PATCH /api/v1/users/admin/:id/activate
```

### Billing
```
GET  /api/v1/billing/plans
GET  /api/v1/billing/subscription
POST /api/v1/billing/checkout
POST /api/v1/billing/portal
GET  /api/v1/billing/invoices
GET  /api/v1/billing/payment-methods
POST /api/v1/billing/cancel
POST /api/v1/billing/webhook  ← register in Stripe dashboard
```

### Search
```
GET /api/v1/search?q=...
```

### Audit
```
GET /api/v1/audit/me
GET /api/v1/audit/system  (admin only)
```

## Quick Start

```bash
cp .env.example .env
docker-compose up -d
npm install
npm run start:dev
```

Docs → http://localhost:3000/docs
