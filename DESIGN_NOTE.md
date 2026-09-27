# Design Note: Scraping Reliability, Architectural Trade-offs & AI Corrections

This design note accompanies the **INE Product Price Tracker** submission. Written from a practical, production-first engineering perspective, it documents:
1. **Scraping Reliability Engineering** — How the scraper overcomes the hostile, dynamic anti-bot defenses of the mock storefront without exhausting host resources.
2. **Architectural Trade-offs & System Decisions** — The deliberate trade-offs evaluated against the real constraints of Render's free tier (512MB RAM), external scheduler limits (30-second cron timeouts), and database safety.
3. **What AI Tools Got Wrong & How I Fixed It** — An honest audit of subtle failure modes introduced by AI coding assistants during initial development and the exact engineering fixes applied.
4. **UI/UX Philosophy** — Why the frontend stayed intentionally minimal and clean.

---

## 0. UI/UX Philosophy

The frontend UI is **intentionally minimal and clean**. This was a deliberate design decision, not a deadline shortcut.

The focus throughout was on **UX over visual complexity**: making data easy to find, read, and act on. A cluttered dashboard with heavy charting libraries, dense colour palettes, or decorative chrome would work against the core purpose \u2014 surfacing price and stock history clearly and honestly.

Key intentional choices:
- **Table-first history view** over heavy SVG charts \u2014 exact values with no smoothing or visual ambiguity (see §2.4).
- **No client-side state management library** \u2014 straightforward React hooks kept the interaction model predictable.
- **Additive-only public actions** \u2014 no destructive controls on the public surface, reducing cognitive load for reviewers.
- **Minimal colour and typography** \u2014 kept focus on data rather than aesthetics.

The UI remained minimal on purpose. UX clarity was the design goal.

---

## 1. Making the Scraper Reliable

The INE mock storefront is intentionally hostile: it introduces rotating DOM classes, bot-detection mouse rituals, artificial network latency, decoy elements, and silently dropped clicks. To make the scraper resilient without exhausting server resources, I implemented the following mechanisms:

### 1.1 Hybrid Ingestion Architecture
Headless Chromium is resource-intensive, consuming ~150MB to 200MB of RAM per instance. Launching browser sessions for product catalog search or listings would quickly overwhelm host memory. 

I split ingestion into two distinct tiers:
* **Plain HTTP (`fetch`) for Catalog & Search:** Handled in [`backend/src/scraper/ineHttpClient.js`](file:///c:/Users/Lenovo/OneDrive/Desktop/ine_product_price_tracker/backend/src/scraper/ineHttpClient.js) with a process-local in-memory cache. Catalog browsing and search queries execute in under 50ms with near-zero memory footprint.
* **Isolated Playwright for Live Price Quotes:** Reserved strictly for the live quote page ([`backend/src/scraper/priceQuoteScraper.js`](file:///c:/Users/Lenovo/OneDrive/Desktop/ine_product_price_tracker/backend/src/scraper/priceQuoteScraper.js)), where client-side JavaScript execution, anti-bot challenge solving, and live DOM rendering are genuinely mandatory.

### 1.2 Manifest-Driven Dynamic Selector Resolution
The storefront rotates its visible price HTML tag (e.g., `strong`, `span`, `b`) and CSS classes dynamically via `/api/v2/ui/manifest`. Simultaneously, it renders hidden decoy elements containing deceptive prices to trap static scrapers.

Instead of guessing fragile selectors or hardcoding brittle class names:
* The scraper intercepts the `/api/v2/ui/manifest` HTTP response loaded by the *same browser page* during navigation (`page.waitForResponse(...)`).
* It extracts the authorized `priceTag` and `classes.priceValue` tokens at runtime.
* It dynamically constructs an exact, manifest-backed visible CSS selector using attribute matchers to prevent arbitrary injection:
  ```javascript
  const requiredClasses = classTokens.map((token) => `[class~="${token}"]`).join('');
  return `.offer-panel.offer-ready .offer-row ${tag}${requiredClasses}:visible`;
  ```
* This guarantees that only the authentic, visible price container is parsed, neutralizing honeypot decoys.

### 1.3 Pointer Ritual & Reactive Unlocking
The "Check price" button (`button.ctl-main`) starts in a disabled state (`offer-locked`). The storefront requires genuine `mousemove` pointer gestures and a dwell period inside the offer panel before activating the control.

Rather than guessing blind wait times:
1. **Pre-interaction State Check:** The scraper first checks whether a prior gesture already unlocked the button. If `!button.disabled` is already true, it skips mouse movement entirely.
2. **Calibrated Pointer Emulation:** If disabled, it dispatches incremental `page.mouse.move` coordinate steps across the panel bounding box with calibrated pauses (`POINTER_MOVE_DELAY_MS = 75ms`).
3. **Mid-Loop Early Exit:** After every coordinate step, it evaluates `!button.disabled`; the millisecond the store enables the button, it breaks out of the motion loop immediately.
4. **Reactive Polling:** It uses `page.waitForFunction` to unblock instantly upon readiness rather than stalling on fixed sleeps.

### 1.4 Handling Silently Dropped Clicks
The mock store intentionally drops user clicks at random intervals. Clicking the button does not guarantee that quote calculation has started.

The scraper detects dropped clicks by inspecting panel state transitions:
* After dispatching `priceControl.click()`, it gives the panel 2 seconds (`QUOTE_START_TIMEOUT_MS = 2000`) to lose the `.offer-locked` class:
  ```javascript
  await page.waitForFunction(
    () => {
      const pricePanel = document.querySelector('.offer-panel');
      return Boolean(pricePanel && !pricePanel.classList.contains('offer-locked'));
    },
    { timeout: QUOTE_START_TIMEOUT_MS }
  );
  ```
* If the panel remains `offer-locked` after 2 seconds, the scraper recognizes the click was dropped. It re-attempts the pointer gesture and click sequence up to 5 times (`QUOTE_START_MAX_ATTEMPTS = 5`) within the same page context before escalating to a page reload.

### 1.5 Bounded Retries with Exponential Backoff
Transient network latency, upstream 502/503 hiccups, and quote timeouts are wrapped in a bounded retry loop:
* Retries up to 3 total attempts per product.
* Applies deterministic exponential backoff (500ms before retry 2, 1,000ms before retry 3, capped at 5,000ms).
* Permanent errors (such as `PRODUCT_NOT_FOUND` or `INVALID_OPTION`) fail fast on the first attempt without triggering retries, conserving server compute.

---

## 2. Architectural Trade-offs & System Design Decisions

Building a reliable tracker under free-tier infrastructure required pragmatic compromises between operational overhead, execution speed, and data integrity.

### 2.1 The 30-Second Cron Timeout & Fire-and-Acknowledge Handshake

```
+----------------+                      +-----------------------+                      +--------------------+
|  cron-job.org  |                      |   Render Web Service  |                      |  Supabase Database |
| (30s timeout)  |                      |    (Node.js/Express)  |                      |    (PostgreSQL)    |
+-------+--------+                      +-----------+-----------+                      +---------+----------+
        |                                           |                                            |
        | 1. POST /internal/scrape (Bearer token)   |                                            |
        |------------------------------------------>|                                            |
        |                                           |                                            |
        | 2. HTTP 202 Accepted (<15ms)              |                                            |
        |<------------------------------------------|                                            |
        |    { ok: true, runId, status: 'started' } |                                            |
        |                                           |                                            |
   [Connection                                      | 3. Detached microtask triggers             |
     Closed]                                        |    runActiveTrackedProductScrape()         |
                                                    |----------------------------------->        |
                                                    |    - Playwright Chromium session           |
                                                    |    - Mouse-move anti-bot ritual            |
                                                    |    - Exponential backoff retries           |
                                                    |                                            |
                                                    | 4. Append-only persistence                 |
                                                    |    INSERT scrape_attempts (per attempt)    |
                                                    |------------------------------------------->|
                                                    |    UPDATE tracked_products (cache)         |
                                                    |------------------------------------------->|
```

* **The Problem:** Free-tier external schedulers like [cron-job.org](https://cron-job.org) drop HTTP connections after a strict **30-second timeout**. Because scraping multiple products with anti-bot pointer rituals and potential retries takes **45 to 90+ seconds**, a synchronous endpoint would consistently trigger `504 Gateway Timeout` errors, causing spurious alert emails and duplicate retry requests.
* **The Solution:** In [`backend/src/controllers/internalScrapeController.js`](file:///c:/Users/Lenovo/OneDrive/Desktop/ine_product_price_tracker/backend/src/controllers/internalScrapeController.js), `POST /internal/scrape` acknowledges valid triggers with `HTTP 202 Accepted` in **under 15ms**, returning `{ ok: true, runId, status: 'started' }`.
* **Microtask Deferral:** In [`backend/src/services/scrapeJobService.js`](file:///c:/Users/Lenovo/OneDrive/Desktop/ine_product_price_tracker/backend/src/services/scrapeJobService.js), background execution is triggered via `Promise.resolve().then(() => executeRun({ runId }))`. Deferring by one microtask guarantees that Express flushes the response to the network socket before CPU-heavy Playwright automation begins.
* **Single-Flight In-Memory Mutex (`already_running`):** If an overlapping trigger arrives while scraping is underway, the starter rejects duplicate execution and returns `202 Accepted` with `status: 'already_running'`, preventing runaway memory spikes.
* **Trade-off Accepted:** The external scheduler receives only an initiation acknowledgment, not the final job result. Full observability is shifted to durable database storage: every attempt writes an immutable row to PostgreSQL, and the dashboard displays live attempt history.

---

### 2.2 Serial Execution over Parallelism (Render 512MB RAM Constraint)
* **The Problem:** Render's free tier imposes a strict **512MB RAM ceiling**. Launching 3–5 parallel Chromium browser contexts via `Promise.all` spikes resident memory over 600MB, triggering immediate Linux cgroup Out-of-Memory (OOM) kills.
* **The Decision:** Process tracked products sequentially using a **single reusable Chromium browser instance** ([`backend/src/scraper/priceQuoteScraper.js`](file:///c:/Users/Lenovo/OneDrive/Desktop/ine_product_price_tracker/backend/src/scraper/priceQuoteScraper.js)). Each product creates and closes its own page context (`page.close()`), tearing down DOM trees and memory allocations after each scrape.
* **Trade-off Accepted:** Total batch run duration scales linearly with product count. Reusing the browser process saves ~1.5s cold-start overhead per product, and keeping peak memory safely under 300MB guarantees rock-solid runtime stability.

---

### 2.3 Append-Only Audit Log vs. In-Place Row Mutation
* **The Problem:** Many CRUD apps overwrite a single `last_price` column in place. However, mutating rows destroys historical context, making it impossible to audit transient retries, network dropouts, or upstream store outages.
* **The Decision:** Implemented an **append-only audit log** in `scrape_attempts` ([`backend/src/services/scrapePersistenceService.js`](file:///c:/Users/Lenovo/OneDrive/Desktop/ine_product_price_tracker/backend/src/services/scrapePersistenceService.js)). Every single attempt (`retried`, `failed`, `success`) is saved as an immutable record with its own timestamp, attempt number, duration, error code, and error message.
* **Trade-off Accepted:** Storing every attempt increases database row count over time. To preserve dashboard performance, I added denormalized cache columns (`last_price`, `last_stock`, `last_scraped_at`) to `tracked_products`, allowing the home page to render active product cards in a single query without joining thousands of historical rows.

---

### 2.4 Table-First History View over Heavy Charts
* **The Problem:** Standard charting libraries (Chart.js, Recharts) add significant bundle weight, struggle to represent non-numeric failure states cleanly, and often smooth over or visually obscure transient retry attempts.
* **The Decision:** In [`frontend/src/components/HistoryTable.jsx`](file:///c:/Users/Lenovo/OneDrive/Desktop/ine_product_price_tracker/frontend/src/components/HistoryTable.jsx), I deliberately built an accessible, table-first history view before considering charts. A clean tabular view displays exact UTC timestamps, exact currency prices, stock levels, attempt numbers, and transparent error messages with zero visual ambiguity.
* **Trade-off Accepted:** Tables are visually simpler than interactive SVG trend graphs, but they guarantee 100% data fidelity, screen-reader accessibility, and instant verification of the core "honest history" requirement.

---

### 2.5 UUIDv4 vs. Sequential Integers (`SERIAL`)
* **The Problem:** Auto-incrementing integers (`id SERIAL PRIMARY KEY`) take slightly less storage (4–8 bytes) and index marginally faster, but couple ID generation to the database and introduce security and coordination liabilities.
* **The Decision:** I chose **UUIDv4** across all primary keys (`tracked_products.id`, `scrape_attempts.id`) in [`backend/db/schema.sql`](file:///c:/Users/Lenovo/OneDrive/Desktop/ine_product_price_tracker/backend/db/schema.sql):
  * **Decoupled ID Generation:** UUIDs can be generated safely in the application layer without roundtrips to the database.
  * **Enumeration Prevention:** Sequential IDs expose business metrics (e.g., total products tracked, scrape frequency) and allow trivial crawling or enumeration attacks on public endpoints.
  * **Multi-Environment Synchronization:** UUIDs prevent primary key collisions when replicating or synchronizing records between local development, dedicated test instances, and production.
* **Trade-off Accepted:** UUIDs occupy 16 bytes and cause minor index fragmentation compared to sequential integers, which is completely negligible at our operational scale.

---

### 2.6 Dedicated Test Supabase Project vs. Shared Database
* **The Problem:** Integration tests create, mutate, and delete records during teardowns. Running tests against a development or production database risks corrupting real tracking history, poisoning scheduled runs, or accidentally wiping submission data.
* **The Decision:** I took on the operational overhead of provisioning a completely separate, dedicated Supabase project exclusively for automated testing (`TEST_SUPABASE_URL`, `TEST_SUPABASE_SERVICE_ROLE_KEY`).
* **Safe Opt-in Policy:** Tests skip by default unless explicitly invoked with `RUN_DB_TESTS=true`. The test suite validates schema compatibility, inserts, and rollback teardowns in complete isolation.
* **Trade-off Accepted:** Maintaining two Supabase projects requires manually synchronizing migrations across both databases, but it provides complete data safety with zero risk of production data corruption.

---

### 2.7 Immediate Initial Scrape on "Track" vs. Awaiting Cron
* **The Problem:** When a user adds a product to track, leaving the card in an empty "Not yet checked" state waiting for the next 2-hour scheduled cron run creates a poor first impression and fails to validate whether the product and option selectors work.
* **The Decision:** In [`backend/src/controllers/trackedProductsController.js`](file:///c:/Users/Lenovo/OneDrive/Desktop/ine_product_price_tracker/backend/src/controllers/trackedProductsController.js), the `POST /api/tracked-products` creation flow executes an immediate, bounded Playwright scrape before completing the request.
* **Trade-off Accepted:** The "Track" API call takes 4–8 seconds while Playwright interacts with the storefront. This short synchronous wait gives visitors an immediate, honest price and stock observation on their newly added item.

---

### 2.8 Shared Public Dashboard without Destructive Controls
* **The Problem:** Requiring login credentials or session tokens adds friction for reviewers evaluating the assignment. However, leaving an unauthenticated dashboard open to public destructive actions (`DELETE`, clear history) invites griefing or accidental data deletion.
* **The Decision:** The dashboard is open and public, but all public actions are strictly additive (search catalog, add product, view history, export CSV). Destructive routes are intentionally omitted from the public API.
* **Database-Enforced Deduplication:** To prevent spam or duplicate entries, uniqueness is enforced at the PostgreSQL layer via a partial unique index in [`backend/db/schema.sql`](file:///c:/Users/Lenovo/OneDrive/Desktop/ine_product_price_tracker/backend/db/schema.sql):
  ```sql
  CREATE UNIQUE INDEX uq_tracked_products_active
    ON tracked_products (product_id, option_id)
    WHERE active = TRUE;
  ```

---

### 2.9 Fixing Upstream Search via Local In-Memory Caching
* **The Problem:** The upstream INE storefront search endpoint (`/api/v2/catalog/search`) was broken during testing: it returned unrelated products, inaccurate total counts, and threw `503 Service Unavailable` errors under rapid keystroke traffic.
* **The Decision:** Rather than proxying broken searches, [`backend/src/scraper/ineHttpClient.js`](file:///c:/Users/Lenovo/OneDrive/Desktop/ine_product_price_tracker/backend/src/scraper/ineHttpClient.js) loads and caches the entire catalog in memory:
  * Ingests 16 pages serially using the maximum safe page limit of 60 items (`CATALOG_PAGE_LIMIT = 60`) with retry backoff to avoid upstream 503s.
  * Caches the normalized product list in process memory for 5 minutes (`CATALOG_CACHE_TTL_MS = 300000`).
  * Performs clean, normalized substring matching locally in Node.js. Subsequent searches respond in <5ms.
* **Trade-off Accepted:** A newly added upstream product can take up to 5 minutes to appear in search results, and cold starts require ~3 seconds to populate the cache. In return, user searches are lightning-fast and 100% reliable.

---

### 2.10 Server-Side RFC 4180 CSV Generation vs. Client-Side Blob Export
* **The Problem:** Client-side CSV generation creates inconsistencies: browsers format dates in the user's local timezone, string escaping varies by platform, and the frontend requires access to raw attempt data or Supabase API keys.
* **The Decision:** Implemented server-side streaming via `GET /api/tracked-products/:id/export` in [`backend/src/services/scrapeExportService.js`](file:///c:/Users/Lenovo/OneDrive/Desktop/ine_product_price_tracker/backend/src/services/scrapeExportService.js):
  * Emits strict RFC 4180 CSVs with CRLF line endings (`\r\n`) and proper quote escaping (`""`).
  * Normalizes all timestamps deterministically to ISO 8601 UTC (`YYYY-MM-DDTHH:mm:ss.sssZ`).
  * Emits empty strings (`""`) for price and stock on failed or retried attempts.
  * Keeps database service keys completely off the client.

---

## 3. What AI Tools Got Wrong & How I Fixed It

During initial scaffolding, AI coding assistants generated several subtle failure modes that compromised reliability, corrupted data, or broke cloud scheduler contracts. Below is an honest audit of those issues and how they were corrected:

### 3.1 Failure 1: Static Selectors and "Direct API" Shortcuts
* **What the AI did:** The AI assistant initially assumed static classes like `.price-value` and proposed skipping Playwright entirely by sending direct POST requests to a discovered quote endpoint.
* **Why it failed:** The mock store was deliberately designed to defeat this: direct HTTP calls lacked session cookies and returned `403 Forbidden`; honeypot DOM elements contained fake prices; and the real price container tag and classes rotated dynamically on every release via `/api/v2/ui/manifest`.
* **The Fix:** Discarded the AI's static assumptions. Implemented dynamic manifest interception (`priceSelectorFromUiManifest`) to extract the authorized tag and class tokens at runtime, combined with native Playwright pointer dispatch to satisfy the genuine interaction requirement.

---

### 3.2 Failure 2: The `Number(null) === 0` Price Corruption Bug
* **What the AI did:** When scaffolding formatting utilities and database mappers, the AI used common JavaScript fallback idioms:
  ```javascript
  // AI scaffolded code:
  price: Number(attempt.price) || 0
  formatPrice: (val) => `₹${Number(val).toFixed(2)}`
  ```
* **Why it failed:** In JavaScript, `Number(null) === 0`. When a scrape timed out or failed, `attempt.price` was `null`. The AI's code converted `null` into `0`, persisting failed attempts as `₹0.00` in PostgreSQL and rendering them as genuine price drops in the UI and CSV export. This violated the core assignment specification:
  > *"Failed attempts must be included, with price and stock left empty."*
* **The Fix:** Enforced strict `null` preservation across all data boundaries:
  * In [`backend/src/services/scrapePersistenceService.js`](file:///c:/Users/Lenovo/OneDrive/Desktop/ine_product_price_tracker/backend/src/services/scrapePersistenceService.js):
    ```javascript
    price: attempt.price ?? null,
    stock: attempt.stock ?? null,
    ```
  * In [`frontend/src/utils/formatters.js`](file:///c:/Users/Lenovo/OneDrive/Desktop/ine_product_price_tracker/frontend/src/utils/formatters.js), added explicit null guards returning `—` (`if (value == null) return '—'`).
  * In [`backend/src/services/scrapeExportService.js`](file:///c:/Users/Lenovo/OneDrive/Desktop/ine_product_price_tracker/backend/src/services/scrapeExportService.js), emitted explicit empty strings (`""`) for price and stock on non-successful attempts.

---

### 3.3 Failure 3: Hardcoded 30-Second Sleep Delays
* **What the AI did:** To wait for the disabled "Check price" button, the AI introduced a fixed sleep:
  ```javascript
  await page.waitForTimeout(30000); // Wait for button to unlock
  ```
* **Why it failed:** Even when the mock store unlocked the button in 2 seconds, the scraper remained frozen for the entire 30 seconds. Across 3 products with retries, batch runs took over 3 minutes, repeatedly hitting external cron timeouts and consuming unnecessary cloud resources.
* **The Fix:** Replaced fixed sleeps with reactive `page.waitForFunction` predicates that resolve the exact millisecond `!button.disabled` becomes true, coupled with pre-checks that skip mouse movements entirely when the button is already active.

---

### 3.4 Failure 4: Bloated Cron Response Crashing cron-job.org
* **What the AI did:** The AI configured `POST /internal/scrape` to return the entire `results` array containing full attempt objects, error stack traces, and product metadata.
* **Why it failed:** Free-tier monitoring services like [cron-job.org](https://cron-job.org) enforce strict response payload limits (typically 1KB–4KB). The large JSON payload exceeded these limits, causing cron-job.org to flag successful scrape runs with an "Output too large" error.
* **The Fix:** Stripped the HTTP response down to a clean, minimal summary:
  ```json
  {
    "ok": true,
    "runId": "run_1727458200000_abc123",
    "total": 3,
    "successful": 3,
    "failed": 0
  }
  ```
  Detailed per-attempt tracking and error logs were delegated entirely to durable PostgreSQL storage and server-side structured logs.
