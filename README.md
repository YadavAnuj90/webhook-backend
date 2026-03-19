# WebhookOS Backend

A production-ready webhook delivery platform built with **NestJS**, **MongoDB**, **Redis (Bull queues)**, and **Razorpay** billing. Provides reliable event dispatching, retry logic, DLQ management, multi-tenant workspaces, and a full REST API documented with Swagger.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [API Documentation](#api-documentation)
- [Project Structure](#project-structure)
- [Modules Overview](#modules-overview)
- [Authentication](#authentication)
- [Docker](#docker)
- [Contributing](#contributing)

---

## Features

- **Webhook Delivery** — Fire events to endpoints with automatic retries, exponential backoff, and dead-letter queue (DLQ)
- **Multi-tenant** — Projects + Workspaces with role-based member management
- **Payload Transformations** — Remove fields, rename keys, add fields, filter events, or apply custom templates
- **Analytics** — Time-series delivery charts, success rates, per-endpoint stats
- **Alerts** — Rule-based notifications on failure rates or latency thresholds
- **Playground** — Test any URL live and validate HMAC-SHA256 signatures interactively
- **Customer Portal** — Issue branded portal tokens for customer-facing webhook dashboards
- **API Key Auth** — Create scoped API keys (`whk_…`) as an alternative to JWT
- **Audit Log** — Immutable audit trail for all user and system actions
- **Billing** — Razorpay order creation, verification, and subscription management
- **Observability** — Health checks (liveness / readiness), Prometheus metrics, Winston logging
- **Search** — Global full-text search across projects, endpoints, and users

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | NestJS (TypeScript) |
| Database | MongoDB via Mongoose |
| Queue | Redis via Bull |
| Auth | Passport JWT + API Key |
| Billing | Razorpay |
| Docs | Swagger / OpenAPI 3 |
| Logging | Winston |
| Scheduling | @nestjs/schedule |
| Observability | @nestjs/terminus + prom-client |
| Containerisation | Docker + Docker Compose |

---

## Getting Started

### Prerequisites

- Node.js >= 18
- MongoDB >= 6
- Redis >= 6

### Installation

```bash
# Clone the repo
git clone https://github.com/your-org/whk-backend.git
cd whk-backend

# Install dependencies
npm install

# Copy the example env and fill in your values
cp .env.example .env
```

### Running locally

```bash
# Development (watch mode)
npm run start:dev

# Production build
npm run build
npm run start:prod
```

Server starts at `http://localhost:3000` by default.
Swagger UI is available at **`http://localhost:3000/api/docs`**.

---

## Environment Variables

Create a `.env` file at the project root (never commit it — it is gitignored):

```env
# App
PORT=3000
FRONTEND_URL=http://localhost:3001

# MongoDB
MONGODB_URI=mongodb://localhost:27017/webhookos

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# JWT
JWT_SECRET=your_super_secret_jwt_key
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=your_super_secret_refresh_key
JWT_REFRESH_EXPIRES_IN=7d

# Razorpay (billing)
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx
RAZORPAY_KEY_SECRET=your_razorpay_secret
RAZORPAY_WEBHOOK_SECRET=your_razorpay_webhook_secret
```

---

## API Documentation

Interactive Swagger UI is served at `/api/docs` when the server is running.

### Base URL

```
http://localhost:3000/api/v1
```

### Authentication

All protected routes accept **either**:

| Method | Header |
|---|---|
| JWT Bearer | `Authorization: Bearer <accessToken>` |
| API Key | `X-API-Key: whk_xxxxxxxx...` |

Obtain a JWT via `POST /api/v1/auth/login`.
Create an API key via `POST /api/v1/api-keys`.

---

## Project Structure

```
src/
├── app.module.ts
├── main.ts
├── common/
│   ├── decorators/          # @Roles decorator
│   ├── filters/             # Global exception filter
│   ├── guards/              # Roles guard
│   └── interceptors/        # Logging interceptor
├── modules/
│   ├── alerts/              # Alert rules & test notifications
│   ├── analytics/           # Delivery stats & time-series charts
│   ├── apikeys/             # API key lifecycle
│   ├── audit/               # Immutable audit log
│   ├── auth/                # JWT auth, sessions, password reset
│   ├── delivery/            # Delivery engine + retry worker
│   ├── endpoints/           # Webhook endpoint config
│   ├── events/              # Event dispatch, history, DLQ
│   ├── health/              # Liveness & readiness probes
│   ├── metrics/             # Prometheus metrics
│   ├── notifications/       # Notification dispatch service
│   ├── payments/            # Razorpay billing
│   ├── playground/          # HTTP test fire + signature validator
│   ├── portal/              # Customer portal tokens
│   ├── projects/            # Project / tenant management
│   ├── search/              # Global full-text search
│   ├── transformations/     # Payload transformation rules
│   ├── usage/               # Plan usage & quota reporting
│   ├── users/               # User profile & admin management
│   ├── webhooks/            # High-level send, broadcast, replay
│   └── workspaces/          # Multi-member workspace management
├── queue/
│   └── queue.constants.ts
└── utils/
    ├── filter-engine.service.ts
    ├── retry.util.ts
    └── signature.util.ts
```

---

## Modules Overview

| Module | Route Prefix | Description |
|---|---|---|
| Auth | `/auth` | Register, login, refresh, logout, password reset/change, sessions |
| Users | `/users` | Profile update, preferences; admin: list / role / suspend |
| Projects | `/projects` | CRUD + member management |
| Workspaces | `/workspaces` | CRUD + invite / accept invite + member roles |
| Endpoints | `/projects/:id/endpoints` | Webhook endpoint CRUD, rotate secret, pause/resume |
| Events | `/projects/:id/events` | Send event, list history, replay, DLQ management |
| Webhooks | `/webhooks` | High-level send, broadcast, replay, delivery logs |
| Analytics | `/projects/:id/analytics` | Summary stats, time-series, top event types |
| Alerts | `/alerts` | Rule CRUD + toggle + test notification |
| API Keys | `/api-keys` | Create, list, revoke, delete, usage stats |
| Transformations | `/transformations` | Rule CRUD + live preview |
| Portal | `/portal` | Token management + public customer access |
| Usage | `/usage` | Period stats + plan quota summary |
| Billing | `/payments` | Plans, order, verify, subscription (Razorpay) |
| Audit | `/audit` | My logs + admin system log |
| Search | `/search` | Global full-text search (`?q=`) |
| Playground | `/playground` | Fire HTTP request + validate HMAC signature |
| Health | `/health` | Full check, liveness, readiness |
| Metrics | `/metrics` | Prometheus scrape endpoint |

---

## Authentication Flow

```
POST /api/v1/auth/register    → { user, accessToken, refreshToken }
POST /api/v1/auth/login       → { user, accessToken, refreshToken }
POST /api/v1/auth/refresh     → { accessToken, refreshToken }
POST /api/v1/auth/logout      → revokes current session
POST /api/v1/auth/logout-all  → revokes all sessions
GET  /api/v1/auth/me          → current user profile
GET  /api/v1/auth/sessions    → list active sessions
POST /api/v1/auth/forgot-password
POST /api/v1/auth/reset-password
POST /api/v1/auth/change-password
```

Access tokens expire in **15 minutes** by default. Use the refresh token to obtain a new pair without re-authenticating.

### Roles

| Role | Access |
|---|---|
| `super_admin` | Full platform access |
| `admin` | Manage users and all resources |
| `developer` | Manage own projects and endpoints |
| `viewer` | Read-only access |

---

## Docker

```bash
# Start MongoDB + Redis + the app
docker compose up -d

# View logs
docker compose logs -f app
```

The `docker-compose.yml` also spins up **Prometheus** (configured via `prometheus.yml`) for metrics collection.

---

## Contributing

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m "feat: add my feature"`
4. Push to the branch: `git push origin feature/my-feature`
5. Open a Pull Request

Please follow [Conventional Commits](https://www.conventionalcommits.org/) for commit messages.

---

## License

MIT © CallerDesk
