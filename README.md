# INE Product Price Tracker

A production-minded, shared public dashboard that tracks INE product prices and stock levels. Visitors can search, view the common tracked list, and add a product option; destructive controls are intentionally not public.

---

## Architecture Overview

```
frontend/   → React + Vite → deployed on Vercel
backend/    → Node.js + Express → deployed on Render
database    → Supabase (PostgreSQL)
scheduler   → cron-job.org (calls POST /internal/scrape every 2 hours)
```

**Scraping strategy:**
- HTTP fetch for product catalog/search (INE `/api/v2/listings`, `/api/v2/items/{id}`)
- Playwright for live price/stock (requires browser-side interaction and quote decoding)

---

## Prerequisites

- Node.js ≥ 20
- A [Supabase](https://app.supabase.com) project
- A [cron-job.org](https://cron-job.org) account (for scheduled scraping)
- The cron account is only needed when the planned Phase 9 endpoint is added.

---

## Getting Started

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd ine_product_price_tracker
```

### 2. Set up the backend

```bash
cd backend
cp .env.example .env      # fill in your real values
npm install
npm run dev               # starts on http://localhost:3001
```

### 3. Set up the frontend

```bash
cd frontend
cp .env.example .env      # set VITE_API_BASE_URL
npm install
npm run dev               # starts on http://localhost:5173
```

### 4. Database schema

For a new database, run `backend/db/schema.sql` in the Supabase SQL editor. For the existing Phase 0-5 schema, run `backend/db/migration_harden_scrape_attempts.sql` once after reviewing its duplicate-active-row preflight.

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Description |
|---|---|
| `PORT` | Port the server listens on (default: 3001) |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (never expose to frontend) |
| `CRON_SECRET` | Shared secret for authenticating cron-job.org requests |
| `INE_BASE_URL` | INE mock store base URL (e.g. `https://hire.ine.com`) |
| `NODE_ENV` | `development` or `production` |
| `LOG_LEVEL` | Optional: `debug`, `info`, `warn`, `error`, or `silent` |

### Frontend (`frontend/.env`)

| Variable | Description |
|---|---|
| `VITE_API_BASE_URL` | Backend API URL (e.g. `http://localhost:3001` or your Render URL) |

---

## NPM Scripts

### Backend

| Script | Description |
|---|---|
| `npm run dev` | Start with file-watching (development) |
| `npm start` | Start production server |
| `npm test` | Run all tests |
| `npm run lint` | Run ESLint |
| `npm run scrape:once` | Manually scrape one product option with the bounded retry policy |

### Frontend

| Script | Description |
|---|---|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Build production bundle |
| `npm run preview` | Preview production build |

---

## Scheduled Scraping (Phase 9 — planned)

The external two-hour cron endpoint is intentionally not implemented yet. It will be added in Phase 9 after retry and scrape-persistence work are complete; the application will not use `setInterval` or an in-process scheduler.

The planned cron job calls:

```
POST <backend-url>/internal/scrape
Authorization: Bearer <CRON_SECRET>
```

The planned backend flow:
1. Authenticates the request
2. Loads all active tracked products
3. Scrapes each product independently with Playwright
4. Persists results (success or failure) to Supabase
5. Returns a run summary

---

## GitHub Actions CI/CD

> _To be documented after Phase 12 implementation._

---

## Design Decisions & Trade-offs

The working design notes are maintained in `design_decisions.txt` and
`tradeoffs.txt`. Key decisions so far:

- The dashboard is shared and public for read/add actions; public destructive
  actions are deliberately absent.
- HTTP is used for catalog data, while Playwright is reserved for the protected
  live quote flow.
- Scrape-attempt history is append-only and distinguishes `success`, `retried`,
  and `failed` outcomes.
- Bounded, classified retry execution is implemented in the scraper; durable
  attempt persistence and scheduling remain later phases, and no in-process
  scheduler is used.

### AI Usage Disclosure

> _Disclose AI assistance and any corrections made._

---

## API Reference

### Products

| Endpoint | Description |
|---|---|
| `GET /api/products/search?q=<query>` | Search products by name |
| `GET /api/products/:productId` | Get product details and options |

### Tracked Products

| Endpoint | Description |
|---|---|
| `POST /api/tracked-products` | Public additive action: add a product option to the shared tracker |
| `GET /api/tracked-products` | List all active shared tracked products |
| `GET /api/tracked-products/:id` | Get one public tracked product |

History/log views and CSV export are intentionally deferred to Phases 8 and 10. Public stop, delete, edit, reset, and schedule/configuration routes are intentionally absent.

### Internal

| Endpoint | Description |
|---|---|
| `GET /health` | Health check |

`POST /internal/scrape` will be added as a cron-authenticated endpoint in Phase 9.

---

## Deployment

### Frontend → Vercel

Connect the `frontend/` directory to a Vercel project. Set `VITE_API_BASE_URL` in Vercel environment settings.

### Backend → Render

Connect the `backend/` directory to a Render Web Service. Set all backend environment variables in Render's environment settings.

### Database → Supabase

Run `backend/db/schema.sql` in the Supabase SQL editor.

### Scheduler → cron-job.org

Create a cron job at cron-job.org:
- URL: `https://<your-render-url>/internal/scrape`
- Method: POST
- Header: `Authorization: Bearer <CRON_SECRET>`
- Schedule: every 2 hours
