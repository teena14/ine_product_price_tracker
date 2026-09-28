import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  downloadTrackedProductHistoryCsv,
  getTrackedProductAlerts,
  getTrackedProductHistory,
  scrapeTrackedProductNow,
} from '../api'
import { FrequencyConfig } from './FrequencyConfig'
import {
  formatDuration,
  formatPrice,
  formatRelativeTime,
  formatStock,
  formatTimestamp,
  outcomeLabel,
} from '../utils/formatters'

// ─── Shared table cell classes ─────────────────────────────────────────────────

const TH_CLASS =
  'border-b border-brand-border px-3 py-2 text-left align-top bg-brand-surface-subtle text-brand-heading text-[0.68rem] tracking-wider uppercase font-bold'

const TD_CLASS =
  'border-b border-brand-border px-3 py-2 text-left align-middle text-xs text-brand-text font-medium'

const TRACKING_REFRESH_INTERVAL_MS = 60_000

// ─── Shared layout primitives ─────────────────────────────────────────────────

const PAGE_CLASS = 'min-h-screen bg-brand-canvas text-brand-text font-sans p-4 sm:p-6 lg:p-8 max-w-[1240px] mx-auto'

const BACK_LINK_CLASS =
  'inline-flex items-center gap-1.5 text-xs font-bold text-brand-heading hover:text-brand-black bg-brand-surface border border-brand-border hover:bg-brand-surface-subtle px-3 py-1.5 rounded-lg transition-all shadow-2xs mb-4 cursor-pointer no-underline'

const BTN_SECONDARY_CLASS =
  'bg-brand-surface hover:bg-brand-surface-subtle border border-brand-border text-brand-heading font-bold rounded-lg px-3 py-1.5 cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed text-xs shadow-2xs flex items-center gap-1.5'

const BADGE_CLASS =
  'rounded-full inline-flex items-center text-[0.68rem] font-bold px-2 py-0.5 text-center whitespace-nowrap'

const STATUS_BADGE_CLASS = {
  success: 'bg-emerald-50 text-emerald-800 border border-emerald-200',
  failed: 'bg-brand-error-bg text-brand-error border border-brand-error/20',
  retried: 'bg-sky-50 text-sky-800 border border-sky-200',
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function BackLink() {
  return (
    <Link to="/" className={BACK_LINK_CLASS}>
      <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <line x1="19" y1="12" x2="5" y2="12" />
        <polyline points="12 19 5 12 12 5" />
      </svg>
      <span>Back to Dashboard</span>
    </Link>
  )
}

function StatusCard({ label, children }) {
  return (
    <div className="bg-brand-surface border border-brand-border rounded-xl p-3.5 sm:p-4 flex flex-col gap-1 card-elevation">
      <span className="text-brand-muted text-[0.68rem] font-bold tracking-wider uppercase">{label}</span>
      {children}
    </div>
  )
}

function EmptyState({ title, children }) {
  return (
    <div className="bg-brand-surface-subtle border border-brand-border rounded-xl p-6 sm:p-8 text-center">
      <h3 className="text-sm font-bold text-brand-heading mb-1">{title}</h3>
      <p className="text-brand-muted text-xs max-w-[380px] mx-auto m-0 leading-relaxed">{children}</p>
    </div>
  )
}

// ─── Track detail page ────────────────────────────────────────────────────────

export function TrackPage() {
  const { productId } = useParams()

  const [historyState, setHistoryState] = useState({ status: 'loading', data: null, error: '' })
  const [exportState, setExportState] = useState({ status: 'idle', error: '' })
  const [manualScrapeState, setManualScrapeState] = useState({
    status: 'idle',
    runId: '',
    error: '',
    initialAttemptCount: 0,
    initialLatestAttemptId: null,
    initialLastScrapedAt: null,
  })
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [productAlerts, setProductAlerts] = useState([])
  // Local override after frequency save so next_scrape_at shows immediately
  const [frequencyOverride, setFrequencyOverride] = useState(null)

  const loadHistory = useCallback(async ({ background = false } = {}) => {
    if (!background) {
      setHistoryState({ status: 'loading', data: null, error: '' })
    }

    try {
      const data = await getTrackedProductHistory(productId)
      setHistoryState({ status: 'success', data, error: '' })
    } catch (error) {
      if (!background) {
        setHistoryState({ status: 'error', data: null, error: error.message })
      }
    }
  }, [productId])

  const loadProductAlerts = useCallback(async () => {
    try {
      const data = await getTrackedProductAlerts(productId)
      setProductAlerts(data.alerts ?? [])
    } catch {
      // non-critical
    }
  }, [productId])

  useEffect(() => {
    if (!productId) return
    // oxlint-disable-next-line react/set-state-in-effect
    loadHistory()
    loadProductAlerts()

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        loadHistory({ background: true })
        loadProductAlerts()
      }
    }

    const intervalId = window.setInterval(refreshWhenVisible, TRACKING_REFRESH_INTERVAL_MS)
    document.addEventListener('visibilitychange', refreshWhenVisible)

    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [productId, loadHistory, loadProductAlerts])

  useEffect(() => {
    if (manualScrapeState.status !== 'running' || !manualScrapeState.runId) return undefined

    let cancelled = false
    let pollTimer

    const pollForManualScrape = async () => {
      try {
        const data = await getTrackedProductHistory(productId)
        if (cancelled) return

        setHistoryState({ status: 'success', data, error: '' })
        const attempts = data.attempts ?? []
        const hasMatchingRun = attempts.some(
          (attempt) => attempt.run_id === manualScrapeState.runId || attempt.runId === manualScrapeState.runId
        )
        const currentLastScrapedAt = data.trackedProduct?.last_scraped_at ?? null
        const historyAdvanced =
          attempts.length > manualScrapeState.initialAttemptCount ||
          (manualScrapeState.initialLatestAttemptId !== null &&
            attempts[0]?.id !== manualScrapeState.initialLatestAttemptId) ||
          currentLastScrapedAt !== manualScrapeState.initialLastScrapedAt

        if (hasMatchingRun || historyAdvanced) {
          setManualScrapeState({
            status: 'idle',
            runId: '',
            error: '',
            initialAttemptCount: 0,
            initialLatestAttemptId: null,
            initialLastScrapedAt: null,
          })
          void getTrackedProductAlerts(productId)
            .then((alertsData) => setProductAlerts(alertsData.alerts ?? []))
            .catch(() => { })
          return
        }
      } catch (error) {
        if (cancelled) return
        setManualScrapeState({
          status: 'error',
          runId: '',
          error: error.message || 'Could not refresh the scrape result',
          initialAttemptCount: 0,
          initialLatestAttemptId: null,
          initialLastScrapedAt: null,
        })
        return
      }

      pollTimer = window.setTimeout(pollForManualScrape, 2_000)
    }

    pollTimer = window.setTimeout(pollForManualScrape, 1_500)
    return () => {
      cancelled = true
      window.clearTimeout(pollTimer)
    }
  }, [manualScrapeState, productId])

  async function handleScrapeNow() {
    const currentAttempts = historyState.data?.attempts ?? []
    const completionBaseline = {
      initialAttemptCount: currentAttempts.length,
      initialLatestAttemptId: currentAttempts[0]?.id ?? null,
      initialLastScrapedAt: historyState.data?.trackedProduct?.last_scraped_at ?? null,
    }

    setManualScrapeState({ status: 'loading', runId: '', error: '', ...completionBaseline })

    try {
      const job = await scrapeTrackedProductNow(productId)
      if (job.status !== 'started') {
        setManualScrapeState({
          status: 'error',
          runId: '',
          error: 'A scrape is already in progress. Please wait for it to finish.',
          initialAttemptCount: 0,
          initialLatestAttemptId: null,
          initialLastScrapedAt: null,
        })
        return
      }

      setManualScrapeState({ status: 'running', runId: job.runId, error: '', ...completionBaseline })
    } catch (error) {
      setManualScrapeState({
        status: 'error',
        runId: '',
        error: error.message || 'Could not start a scrape',
        initialAttemptCount: 0,
        initialLatestAttemptId: null,
        initialLastScrapedAt: null,
      })
    }
  }

  async function handleExportHistory() {
    setExportState({ status: 'loading', error: '' })
    try {
      const blob = await downloadTrackedProductHistoryCsv(productId)
      const objectUrl = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = `tracked-product-${productId}-scrape-history.csv`
      document.body.append(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(objectUrl)
      setExportState({ status: 'idle', error: '' })
    } catch (error) {
      setExportState({ status: 'error', error: error.message })
    }
  }

  // ── Loading / error states ─────────────────────────────────────────────────

  if (historyState.status === 'loading') {
    return (
      <main className={PAGE_CLASS}>
        <BackLink />
        <p className="rounded-[10px] my-5 px-4 py-[13px] bg-brand-info-bg text-brand-info text-sm" role="status">
          Loading tracking details…
        </p>
      </main>
    )
  }

  if (historyState.status === 'error') {
    return (
      <main className={PAGE_CLASS}>
        <BackLink />
        <div className="bg-brand-subtle rounded-[10px] p-7 text-center">
          <h2 className="text-xl font-bold tracking-[-0.02em] mb-1.5 text-brand-heading">
            Could not load tracking details
          </h2>
          <p className="text-brand-muted text-sm mt-0 mb-4">{historyState.error}</p>
          <button type="button" onClick={loadHistory} className={BTN_SECONDARY_CLASS}>
            Try again
          </button>
        </div>
      </main>
    )
  }

  const { trackedProduct: rawProduct, attempts = [] } = historyState.data ?? {}
  // Merge frequency override so the FrequencyConfig panel is always fresh
  const trackedProduct = rawProduct && frequencyOverride
    ? { ...rawProduct, ...frequencyOverride }
    : rawProduct
  if (!trackedProduct) return null

  const latestAttempt = attempts[0] ?? null
  const successfulAttempts = attempts.filter((a) => a.outcome === 'success').slice().reverse()
  const latestSuccess = successfulAttempts[successfulAttempts.length - 1] ?? null

  const currentPrice = latestSuccess?.price ?? null
  const currentStock = latestSuccess?.stock ?? null
  const isAvailable = currentStock != null ? currentStock > 0 : null

  let priceChange = null
  if (successfulAttempts.length >= 2) {
    priceChange = latestSuccess.price - successfulAttempts[successfulAttempts.length - 2].price
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <main className={PAGE_CLASS}>

      {/* ── Navigation ─────────────────────────────────────────────────────── */}
      <nav className="mb-2" aria-label="Page navigation">
        <BackLink />
      </nav>

      {/* ── Product header ─────────────────────────────────────────────────── */}
      <header className="flex flex-col sm:flex-row justify-between items-start w-full mb-5 gap-3 sm:gap-4 pb-4 border-b border-brand-border">
        <div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight mb-1 text-brand-heading">
            {trackedProduct.product_name}
          </h1>
          <p className="text-brand-muted text-xs sm:text-sm font-semibold m-0">{trackedProduct.option_name}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0 self-start sm:self-auto">
          <a
            href={trackedProduct.product_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-brand-heading hover:text-brand-black text-xs font-bold bg-brand-surface border border-brand-border hover:bg-brand-surface-subtle px-3 py-1.5 rounded-lg transition-all shadow-2xs no-underline"
          >
            <span>View in store</span>
            <span aria-hidden="true">→</span>
          </a>
          <button
            type="button"
            onClick={handleScrapeNow}
            disabled={manualScrapeState.status === 'loading' || manualScrapeState.status === 'running'}
            className="bg-brand-lime hover:bg-brand-lime-hover border border-brand-lime text-brand-black font-extrabold rounded-lg px-3.5 py-1.5 cursor-pointer transition-all shadow-xs text-xs active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
          >
            {manualScrapeState.status === 'loading' || manualScrapeState.status === 'running' ? (
              <>
                <span className="w-3.5 h-3.5 rounded-full border-2 border-brand-black border-t-transparent animate-spin inline-block" />
                <span>Scraping…</span>
              </>
            ) : (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
                  <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
                <span>Scrape now</span>
              </>
            )}
          </button>
        </div>
      </header>

      {manualScrapeState.status === 'error' && (
        <p className="rounded-xl mb-4 px-3.5 py-2 bg-brand-error-bg text-brand-error text-xs font-medium border border-brand-error/20" role="alert">
          {manualScrapeState.error}
        </p>
      )}

      {/* ── Status cards ───────────────────────────────────────────────────── */}
      <section
        className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-4"
        aria-label="Current tracking status"
      >
        <StatusCard label="Current Price">
          {currentPrice != null ? (
            <>
              <span className="text-brand-heading text-sm sm:text-base font-bold">{formatPrice(currentPrice)}</span>
              {priceChange !== null && (
                <span
                  className={`text-[0.68rem] font-bold px-2 py-0.5 rounded-full w-fit ${priceChange < 0
                    ? 'bg-brand-success-bg text-brand-success'
                    : priceChange > 0
                      ? 'bg-brand-error-bg text-brand-error'
                      : 'bg-brand-subtle text-brand-muted'
                    }`}
                >
                  {priceChange === 0
                    ? 'No change'
                    : priceChange > 0
                      ? `+${formatPrice(priceChange)}`
                      : `-${formatPrice(Math.abs(priceChange))}`}
                </span>
              )}
            </>
          ) : (
            <span className="text-brand-muted font-normal text-xs">—</span>
          )}
        </StatusCard>

        <StatusCard label="Availability">
          {isAvailable !== null ? (
            <>
              <span className="text-brand-heading text-sm sm:text-base font-bold">
                {isAvailable ? 'In stock' : 'Out of stock'}
              </span>
              {currentStock != null && (
                <span className="text-brand-muted text-[0.68rem]">{formatStock(currentStock)} units</span>
              )}
            </>
          ) : (
            <span className="text-brand-muted font-normal text-xs">Unknown</span>
          )}
        </StatusCard>

        <StatusCard label="Last Checked">
          {latestAttempt ? (
            <>
              <span className="text-brand-heading text-sm sm:text-base font-bold">
                {formatRelativeTime(latestAttempt.scraped_at)}
              </span>
              <span className="text-brand-muted text-[0.68rem]">{formatTimestamp(latestAttempt.scraped_at)}</span>
            </>
          ) : (
            <span className="text-brand-muted font-normal text-xs">Not yet checked</span>
          )}
        </StatusCard>

        <StatusCard label="Tracking Status">
          <span className="text-brand-heading text-sm sm:text-base font-bold">
            <span
              className={`${BADGE_CLASS} ${trackedProduct.active ? 'bg-brand-success-bg text-brand-success' : 'bg-brand-subtle text-brand-muted'
                }`}
            >
              {trackedProduct.active ? 'Active' : 'Paused'}
            </span>
          </span>
          <span className="text-brand-muted text-[0.68rem]">
            {trackedProduct.scrape_frequency_minutes != null
              ? `Custom schedule · every ${trackedProduct.scrape_frequency_minutes} min`
              : 'Global schedule'}
          </span>
        </StatusCard>
      </section>

      {/* ── Layout change warning ───────────────────────────────────────────── */}
      {trackedProduct.layout_changed_at && (
        <div className="rounded-xl my-3 mb-4 px-3.5 py-2.5 bg-amber-50 text-amber-800 text-xs border border-amber-200" role="alert">
          <strong className="inline-flex items-center gap-1">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            Page structure changed
          </strong>{' '}
          The store's page layout changed on{' '}
          <strong>{formatTimestamp(trackedProduct.layout_changed_at)}</strong>. The scraper selectors
          may need a review — check the Advanced Details section for recent errors.
        </div>
      )}

      {/* ── Latest scrape failure alert ─────────────────────────────────────── */}
      {latestAttempt && latestAttempt.outcome !== 'success' && (
        <div className="rounded-xl my-3 mb-4 px-3.5 py-2.5 bg-brand-error-bg text-brand-error text-xs border border-brand-error/20" role="alert">
          <strong>Last check failed:</strong>{' '}
          {latestAttempt.error_code}: {latestAttempt.error_message}
        </div>
      )}

      {/* ── Product-level alerts ────────────────────────────────────────────── */}
      {productAlerts.length > 0 && (
        <section
          className="border border-brand-border rounded-xl bg-brand-surface shadow-2xs mt-3 mb-4 overflow-hidden"
          aria-labelledby="product-alerts-heading"
        >
          <div className="px-4 py-2.5 border-b border-brand-border bg-brand-subtle flex items-center justify-between">
            <h2 id="product-alerts-heading" className="text-xs font-bold text-brand-heading m-0 flex items-center gap-1.5">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              Recent Alerts
            </h2>
            <span className="text-brand-muted text-[0.72rem]">{productAlerts.length} alert{productAlerts.length === 1 ? '' : 's'}</span>
          </div>
          <ul className="divide-y divide-brand-border list-none m-0 p-0">
            {productAlerts.slice(0, 5).map((alert) => (
              <li key={alert.id} className="px-4 py-2.5 flex items-start gap-2.5">
                <span className="shrink-0 mt-0.5 text-brand-heading">
                  {alert.alert_type === 'price_drop' ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="22 17 13.5 8.5 8.5 13.5 2 7" />
                      <polyline points="16 17 22 17 22 11" />
                    </svg>
                  ) : alert.alert_type === 'back_in_stock' ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : alert.alert_type === 'out_of_stock' ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-brand-text text-xs m-0">{alert.message}</p>
                  <span className="text-brand-muted text-[0.68rem]">{formatRelativeTime(alert.created_at)}</span>
                </div>
                {!alert.read_at && (
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-accent shrink-0 mt-1" aria-label="Unread" />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Price & Stock History ───────────────────────────────────────────── */}
      <section
        className="border border-brand-border rounded-xl bg-brand-surface card-elevation mt-3.5 p-4 sm:p-5"
        aria-labelledby="history-heading"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 id="history-heading" className="text-sm sm:text-base font-bold tracking-tight text-brand-heading mb-0">
            Price &amp; Stock History
          </h2>
          <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
            <span className="bg-brand-lime text-brand-black rounded-full text-[0.68rem] font-black px-2.5 py-0.5 shadow-2xs">
              {successfulAttempts.length} observation{successfulAttempts.length === 1 ? '' : 's'}
            </span>
            <button
              type="button"
              className={BTN_SECONDARY_CLASS}
              disabled={exportState.status === 'loading' || successfulAttempts.length === 0}
              onClick={handleExportHistory}
            >
              {exportState.status === 'loading' ? 'Preparing CSV…' : 'Export CSV'}
            </button>
            <button
              type="button"
              aria-expanded={historyOpen}
              aria-controls="history-panel"
              onClick={() => setHistoryOpen((v) => !v)}
              className="bg-brand-surface-subtle hover:bg-brand-surface border border-brand-border p-1.5 rounded-lg cursor-pointer text-brand-heading transition-colors text-xs leading-none shadow-2xs flex items-center justify-center"
              aria-label={historyOpen ? 'Collapse history' : 'Expand history'}
            >
              <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${historyOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          </div>
        </div>

        {exportState.status === 'error' && (
          <p className="rounded-xl my-3 px-3 py-2 bg-brand-error-bg text-brand-error text-xs font-medium border border-brand-error/20" role="alert">
            {exportState.error}
          </p>
        )}

        {historyOpen && (
          <div id="history-panel" className="mt-3.5">
            {successfulAttempts.length === 0 ? (
              <EmptyState title="No price observations yet">
                No successful scrape has been recorded yet.
                {latestAttempt && latestAttempt.outcome !== 'success'
                  ? ' The last check failed — see the Advanced Details below.'
                  : ' The first scheduled or manual scrape will appear here.'}
              </EmptyState>
            ) : (
              <div className="border border-brand-border rounded-lg overflow-x-auto shadow-2xs">
                <table className="w-full min-w-[500px] border-collapse text-left">
                  <caption className="sr-only">Price and stock history</caption>
                  <thead>
                    <tr>
                      <th scope="col" className={TH_CLASS}>Timestamp</th>
                      <th scope="col" className={TH_CLASS}>Price</th>
                      <th scope="col" className={TH_CLASS}>Stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...successfulAttempts].reverse().map((attempt) => (
                      <tr key={attempt.id} className="hover:bg-brand-surface-subtle/50 transition-colors">
                        <td className={TD_CLASS}>{formatTimestamp(attempt.scraped_at)}</td>
                        <td className={`${TD_CLASS} font-bold text-brand-heading`}>{formatPrice(attempt.price)}</td>
                        <td className={TD_CLASS}>{formatStock(attempt.stock)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Settings: Frequency + other controls ────────────────────────────── */}
      <section
        className="border border-brand-border rounded-xl bg-brand-surface card-elevation mt-3.5 p-4 sm:p-5"
        aria-labelledby="settings-heading"
      >
        <button
          type="button"
          id="settings-heading"
          className="w-full bg-transparent border-0 text-brand-heading cursor-pointer flex justify-between items-center text-left font-bold text-sm sm:text-base gap-2 p-0 hover:text-brand-black transition-colors"
          aria-expanded={settingsOpen}
          aria-controls="settings-panel"
          onClick={() => setSettingsOpen((v) => !v)}
        >
          <span>Schedule &amp; Tracking Settings</span>
          <span aria-hidden="true" className="text-brand-muted text-[0.7rem] bg-brand-surface-subtle border border-brand-border rounded-md p-1 flex items-center justify-center">
            <svg className={`w-3 h-3 transition-transform duration-200 ${settingsOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </span>
        </button>

        {settingsOpen && (
          <div id="settings-panel">
            <FrequencyConfig
              trackedProduct={trackedProduct}
              onUpdated={(updated) => setFrequencyOverride(updated)}
            />
          </div>
        )}
      </section>

      {/* ── Advanced Details (collapsible) ──────────────────────────────────── */}
      <section
        className="border border-brand-border rounded-xl bg-brand-surface card-elevation mt-3.5 p-4 sm:p-5"
        aria-labelledby="advanced-heading"
      >
        <button
          type="button"
          id="advanced-heading"
          className="w-full bg-transparent border-0 text-brand-heading cursor-pointer flex justify-between items-center text-left font-bold text-sm sm:text-base gap-2 p-0 hover:text-brand-black transition-colors"
          aria-expanded={advancedOpen}
          aria-controls="advanced-panel"
          onClick={() => setAdvancedOpen((v) => !v)}
        >
          <span>Advanced Details &amp; Scrape Log</span>
          <span aria-hidden="true" className="text-brand-muted text-[0.7rem] bg-brand-surface-subtle border border-brand-border rounded-md p-1 flex items-center justify-center">
            <svg className={`w-3 h-3 transition-transform duration-200 ${advancedOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </span>
        </button>

        {advancedOpen && (
          <div id="advanced-panel" className="mt-3">
            <p className="text-brand-muted text-xs mt-2 mb-3 leading-relaxed font-medium">
              Store product ID:{' '}
              <code className="bg-brand-surface-subtle border border-brand-border rounded px-1.5 py-0.5 font-mono text-[0.72rem] text-brand-heading font-bold">
                {trackedProduct.product_id}
              </code>{' '}
              · Tracked ID:{' '}
              <code className="bg-brand-surface-subtle border border-brand-border rounded px-1.5 py-0.5 font-mono text-[0.72rem] text-brand-heading font-bold">
                {trackedProduct.id}
              </code>{' '}
              · Added: {formatTimestamp(trackedProduct.created_at)}
              {trackedProduct.ui_manifest_hash && (
                <>{' '}· Manifest hash:{' '}
                  <code className="bg-brand-surface-subtle border border-brand-border rounded px-1.5 py-0.5 font-mono text-[0.72rem] text-brand-heading font-bold">
                    {trackedProduct.ui_manifest_hash}
                  </code>
                </>
              )}
            </p>

            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-3 mt-4">
              <h3 className="text-xs font-bold text-brand-heading uppercase tracking-wider mb-0">Scrape Attempt Log</h3>
              <span className="bg-brand-lime text-brand-black rounded-full text-[0.68rem] font-black px-2 py-0.5 shadow-2xs self-start sm:self-auto">
                {attempts.length} attempt{attempts.length === 1 ? '' : 's'}
              </span>
            </div>

            {attempts.length === 0 ? (
              <EmptyState title="No scrape log entries yet">
                The first manual or scheduled scrape will appear here.
              </EmptyState>
            ) : (
              <div className="border border-brand-border rounded-lg overflow-x-auto bg-brand-surface shadow-2xs">
                <table className="w-full min-w-[500px] border-collapse text-left">
                  <caption className="sr-only">Complete scrape log</caption>
                  <thead>
                    <tr>
                      <th scope="col" className={TH_CLASS}>Timestamp</th>
                      <th scope="col" className={TH_CLASS}>Attempt</th>
                      <th scope="col" className={TH_CLASS}>Outcome</th>
                      <th scope="col" className={TH_CLASS}>Price</th>
                      <th scope="col" className={TH_CLASS}>Stock</th>
                      <th scope="col" className={TH_CLASS}>Duration</th>
                      <th scope="col" className={TH_CLASS}>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attempts.map((attempt) => (
                      <tr key={attempt.id} className="hover:bg-brand-surface-subtle/50 transition-colors">
                        <td className={TD_CLASS}>{formatTimestamp(attempt.scraped_at)}</td>
                        <td className={TD_CLASS}>{attempt.attempt_number}</td>
                        <td className={TD_CLASS}>
                          <span className={`${BADGE_CLASS} ${STATUS_BADGE_CLASS[attempt.outcome] ?? STATUS_BADGE_CLASS.failed}`}>
                            {outcomeLabel(attempt.outcome)}
                          </span>
                        </td>
                        <td className={`${TD_CLASS} font-bold text-brand-heading`}>{formatPrice(attempt.price)}</td>
                        <td className={TD_CLASS}>{formatStock(attempt.stock)}</td>
                        <td className={TD_CLASS}>{formatDuration(attempt.duration_ms)}</td>
                        <td className={`${TD_CLASS} text-brand-muted min-w-[200px]`}>
                          {attempt.error_code
                            ? `${attempt.error_code}: ${attempt.error_message}`
                            : 'Validated quote'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  )
}
