# INE Product Price Tracker

A production-minded, shared public dashboard that tracks INE product prices and stock levels. Visitors can search, view the common tracked list, and add a product option; each new option receives an immediate first scrape. Destructive controls are intentionally not public.

> **UI/UX Philosophy:** The interface is intentionally minimal and clean. Design decisions prioritised UX clarity over visual density — the UI stayed minimal on purpose, keeping the focus on data and task flow rather than decorative chrome.

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
| `CRON_SECRET` | Shared secret for authenticating cron-job.org requests |
| `INE_BASE_URL` | INE mock store base URL (e.g. `https://demo.inelabteamdev.com`) |
| `SCRAPE_TRACKED_PRODUCT_IDS` | Comma-separated tracked product UUIDs for index-based CLI scraping (`0, 1, 2`) |
| `SCRAPE_TRACKED_PRODUCT_ID` | Fallback tracked product UUID for manual scraping |
| `PLAYWRIGHT_HEADLESS` | Set to `false` for headed browser execution with visual cursor (default: `true`) |
| `TEST_SUPABASE_URL` | URL for a separate Supabase test project; used only by `db.integration.test.js` |
| `TEST_SUPABASE_SERVICE_ROLE_KEY` | Service-role key for that separate test project only |
| `RUN_DB_TESTS` | Set to `true` only when running database integration tests (default: `false`) |
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
| `npm run scrape:headed` | Run the same manual scrape with a visible Playwright browser |

### Frontend

| Script | Description |
|---|---|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Build production bundle |
| `npm run preview` | Preview production build |

---

## Initial Scrape When Tracking

When a visitor adds a new product option, `POST /api/tracked-products` creates
the shared tracking record and returns immediately. It queues the normal
bounded retry-and-persist flow in the background, so the initial successful
price/stock observation, or its retried/failed attempts, appears shortly
afterwards without making the “Track Product” action wait for Playwright. A
normal scraper failure does not undo tracking: its append-only attempt rows
remain visible and the next scheduled run can try again.

## Manual & Observable (Headed) Scraping

For testing and evaluator demonstration, the scraper can be run manually in both headless and headed modes. In headed mode (`scrape:headed`), a synthetic red cursor overlay tracks every Playwright pointer movement across the page in real-time, allowing you to observe the human-interaction unlock ritual.

### Basic Usage

You can pass a numeric index (`0`, `1`, `2`) corresponding to the configured `SCRAPE_TRACKED_PRODUCT_IDS` in `.env`, or supply a raw UUID:

```bash
# Headless run for product at index 0:
npm run scrape:once -- 0

# Observable headed run for product at index 0 (opens Chromium):
npm run scrape:headed -- 0

# Target other products by index:
npm run scrape:headed -- 1
npm run scrape:headed -- 2
```

### Demonstrating Slow or Failing Responses (Screen Recording)

To evaluate how the scraper handles slow responses and network degradation without racing against the script, use the built-in throttling and inspection flags:

```bash
# 1. Automatic Slow 3G Throttling (CDP network emulation, 400ms latency):
npm run scrape:headed -- 0 --throttle

# 2. Launch with Chrome DevTools already open + 6-second pause to inspect Network:
npm run scrape:headed -- 0 --devtools

# 3. Add a custom pause before navigation begins:
npm run scrape:headed -- 0 --pause=10
```

Each run executes the bounded exponential backoff policy (up to 3 attempts) and appends an immutable database row for every attempt (`retried` on temporary failures, `success` on validated quote, or `failed` on exhausted retries). Price and stock are strictly preserved as `null` on retried/failed rows.

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

## Testing and Hardening 

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

## Scheduled Scraping 

An external scheduler such as [cron-job.org](https://cron-job.org) should call
the protected endpoint every **two hours**. The backend does not use
`setInterval` or any in-process scheduler.

The cron job calls:

```
POST <backend-url>/internal/scrape
Authorization: Bearer <CRON_SECRET>
```

The backend flow:
1. Authenticates the request via Bearer token (`CRON_SECRET`).
2. Immediately acknowledges with `HTTP 202 Accepted` (<15ms), completely bypassing **cron-job.org's 30-second HTTP execution timeout**.
3. Defers the batch scrape to a Node.js background microtask so Render processes all products asynchronously without keeping the HTTP connection open.
4. An in-process single-flight lock (`already_running`) prevents duplicate or overlapping cron triggers from running concurrent browser instances.
5. Scrapes each active product serially with Playwright and appends every retry, success, or final failure to `scrape_attempts`.
6. Updates each successfully scraped product's cached price/stock and stamps `last_scraped_at`, which the dashboard reads.

The immediate acknowledgement payload contains `{ ok, runId, status }`, where `status` is `started` or `already_running`. Detailed outcomes remain in the append-only scrape log and server logs. An invalid or missing `CRON_SECRET` returns `401` and starts no scrape. Configure the cron provider manually after deployment with the production Render URL and an environment-only secret.

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

## Design Decisions, Trade-offs & AI Usage

A detailed technical design note is provided in [`DESIGN_NOTE.md`](./DESIGN_NOTE.md), covering:
- **UI/UX Philosophy:** The frontend UI is intentionally minimal and clean. The focus was on UX — making data easy to find and act on — rather than on visual complexity. The minimal aesthetic was a deliberate design choice, not a time constraint.
- **Scraping Reliability:** Manifest-driven dynamic DOM selectors, pointer interaction emulation, retry policy with exponential backoff, cookie consent dismissal, and isolated browser page contexts.
- **Architectural Trade-offs:**
  1. *Lightweight HTTP vs. Playwright:* Plain `fetch` handles 90% of requests (catalog/search), reserving headless browser resources strictly for the complex quote workflow.
  2. *Append-Only History vs. Overwriting:* Every attempt (retried, failed, success) is recorded as an immutable row, preserving an honest audit trail.
  3. *Serial Execution on Render:* Running products sequentially with browser reuse avoids RAM exhaustion (OOM) on free-tier 512MB hosts.
  4. *Shared Public Dashboard:* Read and add actions are open without authentication so reviewers can immediately inspect live data; destructive actions (delete, clear) are omitted.
  5. *Server-Side CSV Generation:* Guarantees UTC timestamps and strict formatting without exposing database credentials to the browser.
- **AI Tool Mistakes & Corrections:**
  - *Failure 1 (Static Selectors & Direct API):* AI assumed fixed CSS classes or direct quote API fetch; corrected by dynamically reading `/api/v2/ui/manifest` and simulating native mouse moves.
  - *Failure 2 (`Number(null) === 0` Price Bug):* AI initialized empty values to 0, corrupting history with `₹0.00`; corrected to strictly persist `null` and render empty strings in CSV.
  - *Failure 3 (Hardcoded Sleep Delays):* AI used fixed 30s delays; replaced with reactive `waitForFunction` polling that unblocks instantly when the button enables.
  - *Failure 4 (Bloated Cron Response):* AI returned full attempt arrays, exceeding cron-job.org's payload limit; trimmed response to `{ ok, runId, total, successful, failed }`.

See [`DESIGN_NOTE.md`](./DESIGN_NOTE.md) for full architectural explanations.

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
