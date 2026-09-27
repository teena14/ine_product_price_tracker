import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { downloadTrackedProductHistoryCsv, getTrackedProductHistory } from '../api'
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
  'border-b border-brand-border px-3.5 py-3 text-left align-top bg-brand-subtle text-brand-heading text-[0.78rem] tracking-[0.03em] uppercase font-bold'

const TD_CLASS =
  'border-b border-brand-border px-3.5 py-3 text-left align-top text-sm text-brand-text'

// ─── Shared layout primitives ─────────────────────────────────────────────────

const PAGE_CLASS = 'w-[min(100%-32px,960px)] mx-auto pt-10 sm:pt-16 pb-20'

const BACK_LINK_CLASS =
  'text-brand-accent-strong inline-block text-[0.9rem] font-semibold mb-7 no-underline hover:underline focus-visible:outline-3 focus-visible:outline-brand-focus focus-visible:outline-offset-2'

const BTN_SECONDARY_CLASS =
  'bg-brand-surface border border-brand-border-strong text-brand-accent-strong font-semibold rounded-[9px] px-4 py-[11px] cursor-pointer hover:not-disabled:bg-brand-accent-soft hover:not-disabled:border-brand-accent transition-colors disabled:opacity-55 disabled:cursor-not-allowed text-sm focus-visible:outline-3 focus-visible:outline-brand-focus focus-visible:outline-offset-2'

const BADGE_CLASS =
  'rounded-full inline-block text-[0.75rem] font-bold px-[9px] py-1 text-center whitespace-nowrap'

const STATUS_BADGE_CLASS = {
  success: 'bg-brand-success-bg text-brand-success',
  failed:  'bg-brand-error-bg text-brand-error',
  retried: 'bg-brand-info-bg text-brand-info',
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function BackLink() {
  return (
    <Link to="/" className={BACK_LINK_CLASS}>
      ← Back to Tracked Products
    </Link>
  )
}

function StatusCard({ label, children }) {
  return (
    <div className="bg-brand-surface border border-brand-border rounded-xl p-[18px_20px] flex flex-col gap-1.5 shadow-[0_2px_8px_rgb(25_39_52/0.04)]">
      <span className="text-brand-muted text-[0.75rem] font-bold tracking-[0.05em] uppercase">{label}</span>
      {children}
    </div>
  )
}

function EmptyState({ title, children }) {
  return (
    <div className="bg-brand-subtle rounded-[10px] p-7 text-left">
      <h3 className="text-base font-bold text-brand-heading mb-1.5">{title}</h3>
      <p className="text-brand-muted text-sm mt-0">{children}</p>
    </div>
  )
}

// ─── Track detail page ────────────────────────────────────────────────────────

export function TrackPage() {
  const { productId } = useParams()
  const navigate = useNavigate()

  const [historyState, setHistoryState] = useState({ status: 'loading', data: null, error: '' })
  const [exportState, setExportState] = useState({ status: 'idle', error: '' })
  const [advancedOpen, setAdvancedOpen] = useState(false)

  useEffect(() => {
    if (!productId) return
    loadHistory()
  }, [productId])

  async function loadHistory() {
    setHistoryState({ status: 'loading', data: null, error: '' })
    try {
      const data = await getTrackedProductHistory(productId)
      setHistoryState({ status: 'success', data, error: '' })
    } catch (error) {
      setHistoryState({ status: 'error', data: null, error: error.message })
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
      setExportState({ status: 'success', error: '' })
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

  const { trackedProduct, attempts = [] } = historyState.data ?? {}
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
      <header className="flex flex-col sm:flex-row justify-between items-start w-full mb-8 gap-4 sm:gap-8">
        <div>
          <h1 className="text-[clamp(2.25rem,5vw,3.75rem)] font-bold tracking-[-0.045em] leading-[1.05] mb-2 text-brand-heading">
            {trackedProduct.product_name}
          </h1>
          <p className="text-brand-muted text-base mb-2.5">{trackedProduct.option_name}</p>
        </div>
        <a
          href={trackedProduct.product_url}
          target="_blank"
          rel="noreferrer"
          className="text-brand-accent-strong text-[0.9rem] font-bold no-underline whitespace-nowrap hover:underline inline-block mt-2 focus-visible:outline-3 focus-visible:outline-brand-focus focus-visible:outline-offset-2"
        >
          View in store ↗
        </a>
      </header>

      {/* ── Status cards ───────────────────────────────────────────────────── */}
      <section
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-7"
        aria-label="Current tracking status"
      >
        <StatusCard label="Current Price">
          {currentPrice != null ? (
            <>
              <span className="text-brand-heading text-[1.15rem] font-bold">{formatPrice(currentPrice)}</span>
              {priceChange !== null && (
                <span
                  className={`text-[0.82rem] font-semibold px-2 py-[3px] rounded-full w-fit ${
                    priceChange < 0
                      ? 'bg-brand-success-bg text-brand-success'
                      : priceChange > 0
                        ? 'bg-brand-error-bg text-brand-error'
                        : 'bg-brand-subtle text-brand-muted'
                  }`}
                >
                  {priceChange === 0
                    ? 'No change'
                    : priceChange > 0
                      ? `▲ ${formatPrice(priceChange)}`
                      : `▼ ${formatPrice(Math.abs(priceChange))}`}
                </span>
              )}
            </>
          ) : (
            <span className="text-brand-muted font-normal text-base">—</span>
          )}
        </StatusCard>

        <StatusCard label="Availability">
          {isAvailable !== null ? (
            <>
              <span className="text-brand-heading text-[1.15rem] font-bold">
                {isAvailable ? 'In stock' : 'Out of stock'}
              </span>
              {currentStock != null && (
                <span className="text-brand-muted text-[0.82rem]">{formatStock(currentStock)} units</span>
              )}
            </>
          ) : (
            <span className="text-brand-muted font-normal text-base">Unknown</span>
          )}
        </StatusCard>

        <StatusCard label="Last Checked">
          {latestAttempt ? (
            <>
              <span className="text-brand-heading text-[1.15rem] font-bold">
                {formatRelativeTime(latestAttempt.scraped_at)}
              </span>
              <span className="text-brand-muted text-[0.82rem]">{formatTimestamp(latestAttempt.scraped_at)}</span>
            </>
          ) : (
            <span className="text-brand-muted font-normal text-base">Not yet checked</span>
          )}
        </StatusCard>

        <StatusCard label="Tracking Status">
          <span className="text-brand-heading text-[1.15rem] font-bold">
            <span
              className={`${BADGE_CLASS} ${
                trackedProduct.active ? 'bg-brand-success-bg text-brand-success' : 'bg-brand-subtle text-brand-muted'
              }`}
            >
              {trackedProduct.active ? 'Active' : 'Paused'}
            </span>
          </span>
        </StatusCard>
      </section>

      {/* ── Latest scrape failure alert ─────────────────────────────────────── */}
      {latestAttempt && latestAttempt.outcome !== 'success' && (
        <div className="rounded-[10px] my-5 mb-6 px-4 py-[13px] bg-brand-error-bg text-brand-error text-sm" role="alert">
          <strong>Last check failed:</strong>{' '}
          {latestAttempt.error_code}: {latestAttempt.error_message}
        </div>
      )}

      {/* ── Price & Stock History ───────────────────────────────────────────── */}
      <section
        className="border border-brand-border rounded-2xl bg-brand-surface shadow-[0_2px_8px_rgb(25_39_52/0.04)] mt-6 p-5 sm:p-7"
        aria-labelledby="history-heading"
      >
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-4">
          <h2 id="history-heading" className="text-xl font-bold tracking-[-0.02em] text-brand-heading mb-1">
            Price &amp; Stock History
          </h2>
          <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-auto">
            <span className="bg-brand-accent-soft text-brand-accent-strong rounded-full text-[0.75rem] font-bold px-[9px] py-1 text-center whitespace-nowrap">
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
          </div>
        </div>

        {exportState.status === 'success' && (
          <p className="rounded-[10px] my-5 px-4 py-[13px] bg-brand-success-bg text-brand-success text-sm" role="status">
            CSV download started.
          </p>
        )}
        {exportState.status === 'error' && (
          <p className="rounded-[10px] my-5 px-4 py-[13px] bg-brand-error-bg text-brand-error text-sm" role="alert">
            {exportState.error}
          </p>
        )}

        {successfulAttempts.length === 0 ? (
          <EmptyState title="No price observations yet">
            No successful scrape has been recorded yet.
            {latestAttempt && latestAttempt.outcome !== 'success'
              ? ' The last check failed — see the Advanced Details below.'
              : ' The first scheduled or manual scrape will appear here.'}
          </EmptyState>
        ) : (
          <div className="border border-brand-border rounded-[10px] overflow-x-auto">
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
                  <tr key={attempt.id}>
                    <td className={TD_CLASS}>{formatTimestamp(attempt.scraped_at)}</td>
                    <td className={TD_CLASS}>{formatPrice(attempt.price)}</td>
                    <td className={TD_CLASS}>{formatStock(attempt.stock)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Advanced Details (collapsible) ──────────────────────────────────── */}
      <section
        className="border border-brand-border rounded-2xl bg-brand-subtle shadow-[0_2px_8px_rgb(25_39_52/0.04)] mt-6 p-5 sm:p-7"
        aria-labelledby="advanced-heading"
      >
        <button
          type="button"
          id="advanced-heading"
          className="w-full bg-transparent border-0 text-brand-heading cursor-pointer flex justify-between items-center text-left font-bold text-base gap-2 p-0 hover:text-brand-accent-strong focus-visible:outline-3 focus-visible:outline-brand-focus focus-visible:outline-offset-2"
          aria-expanded={advancedOpen}
          aria-controls="advanced-panel"
          onClick={() => setAdvancedOpen((v) => !v)}
        >
          <span>Advanced Details</span>
          <span aria-hidden="true" className="text-brand-muted text-xs">{advancedOpen ? '▲' : '▼'}</span>
        </button>

        {advancedOpen && (
          <div id="advanced-panel">
            <p className="text-brand-muted text-[0.82rem] mt-4 mb-0 leading-[1.8]">
              Store product ID:{' '}
              <code className="bg-brand-border rounded px-1.5 py-0.5 font-mono text-[0.8rem] text-brand-text">
                {trackedProduct.product_id}
              </code>{' '}
              · Tracked ID:{' '}
              <code className="bg-brand-border rounded px-1.5 py-0.5 font-mono text-[0.8rem] text-brand-text">
                {trackedProduct.id}
              </code>{' '}
              · Added: {formatTimestamp(trackedProduct.created_at)}
            </p>

            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-4 mt-5">
              <h3 className="text-base font-bold text-brand-heading mb-1">Scrape Log</h3>
              <span className="bg-brand-accent-soft text-brand-accent-strong rounded-full text-[0.75rem] font-bold px-[9px] py-1 text-center whitespace-nowrap self-start sm:self-auto">
                {attempts.length} attempt{attempts.length === 1 ? '' : 's'}
              </span>
            </div>

            {attempts.length === 0 ? (
              <EmptyState title="No scrape log entries yet">
                The first manual or scheduled scrape will appear here.
              </EmptyState>
            ) : (
              <div className="border border-brand-border rounded-[10px] overflow-x-auto bg-brand-surface">
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
                      <tr key={attempt.id}>
                        <td className={TD_CLASS}>{formatTimestamp(attempt.scraped_at)}</td>
                        <td className={TD_CLASS}>{attempt.attempt_number}</td>
                        <td className={TD_CLASS}>
                          <span className={`${BADGE_CLASS} ${STATUS_BADGE_CLASS[attempt.outcome] ?? STATUS_BADGE_CLASS.failed}`}>
                            {outcomeLabel(attempt.outcome)}
                          </span>
                        </td>
                        <td className={TD_CLASS}>{formatPrice(attempt.price)}</td>
                        <td className={TD_CLASS}>{formatStock(attempt.stock)}</td>
                        <td className={TD_CLASS}>{formatDuration(attempt.duration_ms)}</td>
                        <td className={`${TD_CLASS} text-brand-muted min-w-[250px]`}>
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
