# 🏥 Purchase Summary & Payment Follow-up Manager

A production-ready, mobile-friendly web application designed for pharmacies and healthcare businesses to record customer purchases, generate colorful purchase summaries, dispatch official WhatsApp payment notifications, track pending payments, run automated daily reminders, process payment receipts, and enforce 30-day retention cleanup.

---

## 🎯 Key Design & Business Purpose

> **Note**: This application is strictly a **Purchase Summary & Payment Follow-up Manager**. It is NOT an invoicing tool, accounting software, prescription manager, or medicine ordering application.

### Key Capabilities:
* **Fast Purchase Recording**: Add customer details and items with real-time Gross, Discount, and Net calculation in under 60 seconds.
* **Colorful Purchase Summaries**: Clean, visually appealing customer summaries featuring pharmacy branding, item breakdown, and UPI/QR payment details.
* **Browser Print Layout**: Dedicated print stylesheet formatted for receipts/A4 printouts with zero browser chrome.
* **Official Meta WhatsApp Cloud API**: Direct integration with Meta's official WhatsApp Business Platform (no unofficial hacks, no n8n). Includes a development-safe Mock Provider for local testing.
* **Pending Payment Tracking**: Real-time pending age tracker (`Today`, `1 day ago`, `2 days ago`...) and actionable payment status dashboard.
* **Payment Received Workflow**: Single-click payment confirmation, automatic reminder halting, and instant WhatsApp thank-you confirmation.
* **30-Day Paid Data Retention**: Automated daily cleanup that purges paid records older than 30 days while preserving pending/unpaid purchases.

---

## 🏗️ Architecture & Tech Stack

```
   ┌─────────────────────────────────────────────────────────┐
   │             Next.js 14 (App Router) + React             │
   │           Tailwind CSS  •  Lucide Icons  •  Zod         │
   └────────────────────────────┬────────────────────────────┘
                                │
        ┌───────────────────────┴───────────────────────┐
        ▼                                               ▼
┌───────────────────────────────┐               ┌──────────────────────────────┐
│  Next.js Server Route Handler │               │ Supabase PostgreSQL Database │
│     & Background Schedulers   │               │   Row Level Security (RLS)   │
└───────────────┬───────────────┘               └──────────────────────────────┘
                │
                ▼
┌────────────────────────────────────────────────────────┐
│             WhatsApp Provider Adapter                  │
│  ┌──────────────────────────┬────────────────────────┐ │
│  │ Meta Cloud API (v20.0)   │ Dev Mock Client (Test) │ │
│  └──────────────────────────┴────────────────────────┘ │
└────────────────────────────────────────────────────────┘
```

* **Frontend**: Next.js 14 App Router, TypeScript, React 18, Tailwind CSS.
* **Database & Auth**: Supabase PostgreSQL with Row Level Security (RLS) and Supabase Auth.
* **WhatsApp Provider**: Meta WhatsApp Business Platform / Cloud API (v20.0) with provider adapter abstraction.
* **Scheduled Automation**: Server-side API endpoints (`/api/cron/*`) secured with `CRON_SECRET`.
* **Testing**: Vitest unit test suite covering calculations, validations, and end-to-end lifecycle scenarios.

---

## 🚀 Quick Start & Local Setup

### 1. Prerequisites
* Node.js v18+ or v20+
* npm or yarn
* Supabase Account (Free Tier)
* Meta for Developers Account (Optional for WhatsApp live messages; fallback mock active by default)

### 2. Clone & Install Dependencies
```bash
cd "Credit Reminder App"
npm install
```

### 3. Setup Environment Variables
Copy the example environment file:
```bash
cp .env.example .env.local
```

Configure the following variables in `.env.local`:
```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# Cron Security Token
CRON_SECRET=your-secure-random-token-here

# Meta WhatsApp Cloud API (Leave blank to use built-in Mock Provider in dev)
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_API_VERSION=v20.0
```

### 4. Database Setup & Migrations
Execute the SQL migration scripts in your Supabase SQL Editor in numerical order:
1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_indexes.sql`
3. `supabase/migrations/003_rls.sql`
4. `supabase/migrations/004_functions.sql`

### 5. Run Local Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧮 Calculation Engine Specification

For every item:
$$\text{Gross Item Amount} = \text{Quantity} \times \text{MRP}$$
$$\text{Item Net Amount} = \text{Gross Item Amount} - \text{Item Discount}$$

For the total purchase:
$$\text{Gross Total} = \sum \text{Gross Item Amounts}$$
$$\text{Total Discount} = \sum \text{Item Discounts}$$
$$\text{Amount Payable} = \text{Gross Total} - \text{Total Discount}$$

### Acceptance Example:
* **Product A**: $2 \times ₹100 = ₹200$, Discount = $₹10 \implies \text{Net} = ₹190$
* **Product B**: $1 \times ₹250 = ₹250$, Discount = $₹20 \implies \text{Net} = ₹230$
* **Gross Total**: $₹450$
* **Total Discount**: $₹30$
* **Amount Payable**: $₹420$

---

## 📱 Meta WhatsApp Business Cloud API Integration

The application integrates with the official **Meta WhatsApp Cloud API**.

### How to Configure WhatsApp Cloud API:
1. Navigate to [developers.facebook.com](https://developers.facebook.com) and create a **Business App**.
2. Add **WhatsApp** product to your app.
3. In **API Setup**, retrieve your:
   * **Phone Number ID** $\to$ `WHATSAPP_PHONE_NUMBER_ID`
   * **WhatsApp Business Account ID** $\to$ `WHATSAPP_BUSINESS_ACCOUNT_ID`
   * **Permanent System User Access Token** $\to$ `WHATSAPP_ACCESS_TOKEN`
4. Store these values in `.env.local` or your hosting environment settings.

> **Mock Mode**: When `WHATSAPP_ACCESS_TOKEN` is omitted during local development, the app seamlessly runs in Mock Mode, logging simulated WhatsApp messages to console without throwing errors.

---

## ⏰ Scheduled Cron Automations

Two server-side background endpoints are included:

| Endpoint | Frequency | Description |
| :--- | :--- | :--- |
| `/api/cron/daily-reminders` | Daily at 09:00 AM | Scans `PENDING` purchases $\ge 1$ day old and sends WhatsApp reminders (with daily idempotency). |
| `/api/cron/cleanup-paid` | Daily at 02:00 AM | Purges `PAID` purchases older than 30 days along with their child logs and items. |

### How to Trigger Cron:
Pass the authorization header matching `CRON_SECRET`:
```bash
curl -X POST https://your-domain.com/api/cron/daily-reminders \
     -H "Authorization: Bearer your-secure-random-token-here"
```

---

## 🧪 Testing

Run the automated test suite with Vitest:
```bash
npm run test
```

### Test Coverage:
* `tests/calculations.test.ts`: Currency decimal math, negative protections, discount capping, INR formatting.
* `tests/validations.test.ts`: Zod schema validation, phone number normalization (`+91`).
* `tests/scenarios.test.ts`: End-to-end acceptance flow (Customer Ravi $\to$ Purchase $\to$ Reminder $\to$ Payment Received $\to$ 30-day retention).

---

## 🛡️ Security & Privacy

1. **Zero Secret Leaks**: Secrets (`SUPABASE_SERVICE_ROLE_KEY`, `WHATSAPP_ACCESS_TOKEN`, `CRON_SECRET`) are strictly server-side and never exposed to the browser.
2. **Row Level Security (RLS)**: Enabled across all PostgreSQL tables.
3. **Data Retention Minimization**: Paid records are permanently purged after 30 days to protect customer privacy and conserve database storage.

---

## 📄 License
MIT License. Built for pharmacy purchase summaries and payment follow-ups.
