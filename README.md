# INE Product Price Tracker

A production-minded, shared public dashboard that tracks INE product prices and stock levels. Visitors can search, view the common tracked list, and add a product option; each new option receives an immediate first scrape. Destructive controls are intentionally not public.

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
- The quote page’s public UI manifest determines its rotating price tag and
  class. The scraper captures that response from the same browser page and
  waits for the stable quote state, rather than relying on a fixed selector.
  It performs the required real pointer movement and trusted click; it does
  not call the protected quote endpoint directly.

---

## Prerequisites

- Node.js ≥ 20
- A [Supabase](https://app.supabase.com) project
- A separate Supabase project for opt-in database integration tests
- A [cron-job.org](https://cron-job.org) account (for scheduled scraping)
- The cron account is only needed when you deploy and configure scheduled scraping.

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

Run `backend/db/schema.sql` in the Supabase SQL editor to create or update the application database tables, indexes, and triggers.

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Description |
|---|---|
| `PORT` | Port the server listens on (default: 3001) |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (never expose to frontend) |
| `TEST_SUPABASE_URL` | URL for a completely separate Supabase test project; used only by `db.integration.test.js` |
| `TEST_SUPABASE_SERVICE_ROLE_KEY` | Service-role key for that separate test project only |
| `RUN_DB_TESTS` | Set to `true` only when intentionally running database integration tests (default: `false`) |
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
| `npm run test:coverage` | Run the default test suite with a coverage report |
| `npm run lint` | Run ESLint |
| `npm run scrape:once` | Manually scrape and persist one existing tracked product with bounded retries |

### Frontend

| Script | Description |
|---|---|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Build production bundle |
| `npm run preview` | Preview production build |

---

## Initial Scrape When Tracking

When a visitor adds a new product option, `POST /api/tracked-products` creates
the shared tracking record and then runs the normal bounded retry-and-persist
flow before returning. The dashboard opens the new record's details so the
first successful price/stock observation, or its retried/failed attempts, is
visible straight away. A normal scraper failure does not undo tracking: its
append-only attempt rows remain visible and the next scheduled run can try
again.

## Manual Scrape Persistence (Phase 7)

To make a deliberate manual scrape against an existing active tracking record,
set `SCRAPE_TRACKED_PRODUCT_ID` to that record's UUID or pass it directly:

```bash
npm run scrape:once -- <tracked-product-uuid>
```

The script runs the bounded retry policy and appends one database row for each
event: `retried` for unsuccessful attempts that will retry, `success` for a
validated quote, or `failed` for the final failure. It never updates an older
successful observation. This is a manual tool only; the authenticated cron
route is a separate operational trigger for deployed scheduled runs.

---

## Database Integration Tests

`backend/tests/db.integration.test.js` creates, updates, and deletes rows, so
it is isolated from the normal application database. Create a separate
Supabase project for tests and manually apply the required schema to that test
project only. Do not point the test variables at development or production.

Set these values in `backend/.env` (or inject them in a dedicated CI test
environment):

```bash
TEST_SUPABASE_URL=https://<test-project-ref>.supabase.co
TEST_SUPABASE_SERVICE_ROLE_KEY=<test-project-service-role-key>
RUN_DB_TESTS=true
```

Then run `npm test` from `backend/`. The integration suite is skipped unless
`RUN_DB_TESTS=true` and both non-empty, valid `TEST_SUPABASE_*` values are
provided. It never falls back to `SUPABASE_URL` or
`SUPABASE_SERVICE_ROLE_KEY`, and it skips if the test URL matches the normal
application URL. Cleanup deletes only tracked-product IDs created
by that test process, and cascade deletion removes their associated test
attempts. Connection or authorization failures against the test project fail
the opted-in suite rather than touching another database.

---

## Testing and Hardening (Phase 11)

The default backend test suite is deterministic and does not contact Supabase,
the live INE store, or a real Playwright browser. It covers public API
validation and destructive-route absence, cron authentication, append-only
retry/persistence behavior, CSV formatting, repository query/error mapping,
and the mocked browser quote workflow (including timeout and page cleanup).

The real Supabase integration suite remains opt-in and uses only the separate
`TEST_SUPABASE_*` project described above. Run `npm run test:coverage` to
produce a backend coverage report. The frontend is checked with its production
build and linter; no additional browser-test framework has been introduced for
this small assignment.

---

## Scheduled Scraping (Phase 9)

An external scheduler such as [cron-job.org](https://cron-job.org) should call
the protected endpoint every **two hours**. The backend does not use
`setInterval` or any in-process scheduler.

The cron job calls:

```
POST <backend-url>/internal/scrape
Authorization: Bearer <CRON_SECRET>
```

The backend flow:
1. Authenticates the request
2. Loads all active tracked products
3. Scrapes each product independently with Playwright
4. Persists results (success or failure) to Supabase
5. Returns a run summary

The endpoint returns only a summary such as `runId`, `total`, `successful`,
and `failed`; detailed scraper errors remain in the append-only scrape log and
server logs. An invalid/missing `CRON_SECRET` returns `401` and starts no
scrape. Configure the cron provider manually after deployment with the
production Render URL and an environment-only secret.

---

## GitHub Actions CI/CD

`.github/workflows/ci.yml` runs on pull requests targeting `main` and on
pushes to `main`. It has two independent Ubuntu/Node 20 jobs:

- **Backend:** installs `backend/package-lock.json` with `npm ci`, runs ESLint,
  then runs the deterministic test suite with coverage.
- **Frontend:** installs `frontend/package-lock.json` with `npm ci`, runs the
  frontend linter, then creates a production Vite build.

The Node dependency cache is keyed by each job's lockfile. CI fixes
`RUN_DB_TESTS=false`, so it never uses a Supabase project, production secrets,
or live INE/Playwright scraping. When a test/build stage fails, any generated
backend coverage or frontend build output is uploaded as a workflow artifact
where available.

There is intentionally no GitHub Actions deployment job. Once the Vercel and
Render projects are connected to this repository, use their native deployment
integration for `main` only and keep provider credentials in provider settings
or GitHub Secrets if they become necessary. Pull requests must remain
non-production, and GitHub Actions must never trigger scheduled scraping.

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
- Retry events are validated and persisted append-only; an authenticated
  external cron trigger runs active products without an in-process scheduler.
- Public product details show the latest attempt, successful price/stock
  observations, and the full scrape log without exposing history edits.
- CSV exports are generated by the backend so the browser receives only a
  public download, not database credentials or direct table access.

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
| `POST /api/tracked-products` | Public additive action: add a product option and record its first bounded scrape |
| `GET /api/tracked-products` | List all active shared tracked products |
| `GET /api/tracked-products/:id` | Get one public tracked product |
| `GET /api/tracked-products/:id/history` | Get the tracked product and its complete public scrape-attempt history |
| `GET /api/tracked-products/:id/export` | Download every scrape attempt as a CSV attachment |

The dashboard provides a table-first history/log detail view and CSV download.
Each export has one chronological row per scrape attempt, including retried and
failed attempts. It uses ISO 8601 UTC timestamps and leaves price/stock blank
for non-success outcomes. Public stop, delete, history edit, reset, and
schedule/configuration routes are intentionally absent.

Product search filters the catalog by normalized product name as you type and
shows only matching results. The API pages the filtered matches, and the
dashboard exposes Previous/Next controls when more than one matching page is
available.

### Internal

| Endpoint | Description |
|---|---|
| `GET /health` | Health check |
| `POST /internal/scrape` | Cron-authenticated run of all active tracked products |

`POST /internal/scrape` requires `Authorization: Bearer <CRON_SECRET>` and is
not a public dashboard action.

---

## CSV Export

Open a tracked product’s details and select **Export CSV**. The browser calls
the public `GET /api/tracked-products/:id/export` endpoint and downloads a
server-generated CSV. No deployment-specific configuration or new environment
variables are required for this feature.

---

## Deployment

### Frontend → Vercel

Connect the `frontend/` directory to a Vercel project. Set `VITE_API_BASE_URL` in Vercel environment settings.

### Backend → Render

Connect the `backend/` directory to a Render Web Service. Set all backend environment variables in Render's environment settings.

### Database → Supabase

Run `backend/db/schema.sql` in the Supabase SQL editor.

### Scheduler → cron-job.org

After the backend is deployed, create a cron job at cron-job.org:

- URL: `https://<your-render-url>/internal/scrape`
- Method: POST
- Header: `Authorization: Bearer <CRON_SECRET>`
- Schedule: every 2 hours
