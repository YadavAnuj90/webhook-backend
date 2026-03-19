# Frontend Integration Prompt — Billing, Trial, Credits & Reseller System

---

## CONTEXT

The backend now has a complete billing system implementing:
1. **10-Day Free Trial** — every new user automatically gets a 10-day trial. After expiry, APIs return HTTP 402 with `{ code: "trial_expired", message: "Your 10-day free trial has expired. Please upgrade." }`.
2. **Self-Service Subscription Portal** — users can upgrade to Starter / Pro / Enterprise plans via Razorpay.
3. **Webhook Credits System** — users can buy prepaid credit packages (₹499 for 10K events, etc.) instead of monthly plans. Useful for B2B customers.
4. **Usage-Based Reseller Billing** — Enterprise users can become resellers, onboard their own customers, set per-event pricing, and generate monthly invoices.

All billing endpoints are under `/api/v1/billing/*`.

---

## 1. GLOBAL — HANDLE HTTP 402 RESPONSES

In your API interceptor/axios config, add:

```js
// In your axios interceptor or global error handler:
if (error.response?.status === 402) {
  const { code, message } = error.response.data;
  // Redirect to upgrade page with context
  router.push(`/billing/upgrade?reason=${code}`);
  toast.error(message);
}
```

---

## 2. SHOW TRIAL BANNER

On every page (after login), call `GET /api/v1/billing/subscription/trial` and show a sticky banner if trial is active:

**Response:**
```json
{
  "status": "trial",
  "planName": "Free Trial",
  "trialEndAt": "2024-12-25T00:00:00Z",
  "daysLeft": 7
}
```

**Banner logic:**
- `daysLeft > 3` → blue info banner: "You have X days left in your free trial. Upgrade now →"
- `daysLeft <= 3` → orange warning banner: "⚠️ Trial expires in X days!"
- `status === "trial_expired"` → red banner + block UI: "Trial expired. Choose a plan to continue."
- `status === "active"` → no banner

---

## 3. BILLING / UPGRADE PAGE (`/billing`)

### 3a. Fetch Plans
```
GET /api/v1/billing/plans
```
Response: array of `{ id, name, priceMonthly, currency, eventsPerMonth, endpointsLimit, retentionDays, features: { analytics, ai, slaMonitoring, reseller, mtls, customDomains, priorityQueue, eventCatalog } }`

**Show a pricing table** with 4 columns: Trial (current), Starter (₹2,499/mo), Pro (₹8,299/mo), Enterprise (₹32,999/mo).

### 3b. Get Current Subscription
```
GET /api/v1/billing/subscription
```
Response: `{ status, planId, planName, daysLeft, currentPeriodEnd, eventsPerMonth, endpointsLimit }`

Show current plan badge + renewal date.

### 3c. Upgrade Flow (Razorpay)
```
POST /api/v1/billing/subscription/upgrade/order
Body: { planId: "starter" | "pro" | "enterprise" }
```
Returns Razorpay `orderId`, `amount`, `keyId`. Open Razorpay modal.

On Razorpay success:
```
POST /api/v1/billing/subscription/upgrade/verify
Body: { orderId, paymentId, signature, planId }
```
→ Show "Plan activated!" toast and refresh subscription.

### 3d. Cancel Subscription
```
POST /api/v1/billing/subscription/cancel
Body: { reason?: string }
```

---

## 4. CREDITS PAGE (`/billing/credits`)

### 4a. Show Balance
```
GET /api/v1/billing/credits/balance
```
Response: `{ balance, lifetimePurchased, lifetimeUsed, autoTopUpEnabled, autoTopUpThreshold }`

Show large balance number + a "Top up" button.

### 4b. Credit Packages
```
GET /api/v1/billing/credits/packages
```
Response array: `{ _id, name, credits, bonusCredits, price, description }`

**Show package cards** — e.g.:
- Micro Pack: 10,000 credits — ₹499
- Starter Pack: 50,000 + 2,500 bonus — ₹1,999
- Business Pack: 1,000,000 + 150,000 bonus — ₹29,999

### 4c. Buy Credits Flow (Razorpay)
```
POST /api/v1/billing/credits/purchase/order
Body: { packageId: "<id from packages list>" }
```
Returns `orderId`, `amount`, `keyId`. Open Razorpay modal.

On success:
```
POST /api/v1/billing/credits/purchase/verify
Body: { orderId, paymentId, signature, packageId }
```
→ Toast: "50,000 credits added to your account!"

### 4d. Transaction History
```
GET /api/v1/billing/credits/transactions?limit=20&skip=0
```
Response: `[{ type, amount, balanceAfter, description, createdAt }]`

Show a ledger table with: Date | Type | Credits | Balance After | Description

**Types to display nicely:**
- `purchase` → green "+X credits"
- `usage` → red "-X credits"
- `bonus` → gold "+X bonus"
- `refund` → green "+X refund"
- `adjustment` → grey "±X admin"

### 4e. Auto Top-Up Settings
```
PATCH /api/v1/billing/credits/auto-topup
Body: { enabled: true, packageId: "<id>", threshold: 1000 }
```
Show a toggle + "when balance drops below N credits, auto-purchase [package]."

---

## 5. INVOICES PAGE (`/billing/invoices`)

```
GET /api/v1/billing/invoices
```
Response: `[{ invoiceNumber, type, status, total, currency, periodStart, periodEnd, paidAt, lineItems }]`

Show a table:
- Invoice # | Date | Description | Amount | Status (badge: PAID=green, OPEN=yellow, VOID=grey)
- Click row → show detail modal with line items

```
GET /api/v1/billing/invoices/:id
```

**Invoice types:**
- `subscription` → "Monthly Subscription — Pro Plan"
- `credit` → "Credit Package Purchase — 50K credits"
- `usage` → "Usage-Based Billing — 45,321 events delivered"

---

## 6. RESELLER PORTAL (`/billing/reseller`) — Enterprise plan only

Show this section only if `subscription.features.reseller === true`.

### 6a. Setup Profile
```
POST /api/v1/billing/reseller/profile
Body: { companyName, logoUrl, supportEmail, webhookPortalDomain, defaultMarkupPct, pricePerThousandEvents }
```
```
GET /api/v1/billing/reseller/profile
```

Show form: Company name, logo, support email, custom portal domain, markup %, price per 1K events.

### 6b. Customers Table
```
GET /api/v1/billing/reseller/customers
```
Response: `[{ customerId, customer: { email, firstName, lastName }, currentMonthEvents, pricePerThousandEvents, isActive }]`

Show table: Customer | Events This Month | Monthly Est. | Status | Actions (Suspend / Reactivate)

```
POST /api/v1/billing/reseller/customers
Body: { customerEmail, markupPct, pricePerThousandEvents, notes }
```
→ "Add Customer" modal — enter their email (must already be registered).

```
POST /api/v1/billing/reseller/customers/:customerId/suspend
POST /api/v1/billing/reseller/customers/:customerId/reactivate
```

### 6c. Customer Invoices
```
GET /api/v1/billing/reseller/customers/:customerId/invoices
```
Show list of usage-based invoices for a specific customer.

### 6d. Generate Invoices (manual trigger)
```
POST /api/v1/billing/reseller/invoices/generate
```
→ "Generate Monthly Invoices" button → toast: "Generated 5 invoices for your customers."

### 6e. Revenue Dashboard
```
GET /api/v1/billing/reseller/revenue
```
Response: `{ totalCollected, paidInvoices, totalCustomers }`

Show 3 stat cards: Total Revenue | Paid Invoices | Active Customers

### 6f. Custom Plans
```
GET /api/v1/billing/reseller/plans
POST /api/v1/billing/reseller/plans
Body: { name, description, priceMonthly, eventsPerMonth, endpointsLimit, retentionDays }
```
Create custom plans to assign to your reseller customers.

---

## 7. STATUS CODES TO HANDLE

| Code | Meaning | Action |
|------|---------|--------|
| 402 `trial_expired` | 10-day trial ended | Redirect to `/billing` upgrade page |
| 402 `subscription_expired` | Monthly plan expired | Show renew modal |
| 402 `payment_past_due` | Payment failed | Show update payment method |
| 402 `account_suspended` | Admin suspended | Show contact support |
| 409 | Already subscribed / customer exists | Show error toast |
| 404 | Resource not found | Show 404 UI |

---

## 8. SIDEBAR / NAV UPDATES

Add to sidebar:
```
Billing
  ├── Overview        → /billing
  ├── Credits         → /billing/credits
  ├── Invoices        → /billing/invoices
  └── Reseller Portal → /billing/reseller  [show only if enterprise]
```

In the user profile dropdown, show:
- Plan badge: `TRIAL (7 days left)` or `PRO` or `ENTERPRISE`
- Quick link: "Manage Billing"

---

## 9. REGISTER PAGE UPDATE

After successful registration, show:
```
✅ Account created! Your 10-day free trial has started.
   Trial ends: <date>

   You can use all features for free during your trial.
   No credit card required.
```

---

## 10. SUBSCRIPTION STATUS BADGE COLORS

| Status | Color | Label |
|--------|-------|-------|
| `trial` | Blue | 🟦 Trial (N days left) |
| `trial_expired` | Red | 🔴 Trial Expired |
| `active` | Green | 🟢 Active |
| `past_due` | Orange | 🟠 Payment Due |
| `cancelled` | Grey | ⬜ Cancelled |
| `suspended` | Red | 🔴 Suspended |
| `credit_only` | Purple | 🟣 Pay-as-you-go |

---

*Backend base URL: `/api/v1` — All billing endpoints require `Authorization: Bearer <JWT>`*
