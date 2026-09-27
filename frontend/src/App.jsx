import { useState } from 'react'
import { downloadAllTrackedProductsHistoryCsv } from './api'
import { AlertsBell } from './components/AlertsBell'
import { ProductConfiguration } from './components/ProductConfiguration'
import { ProductSearch } from './components/ProductSearch'
import { TrackedProducts } from './components/TrackedProducts'
import { useProductSelection } from './hooks/useProductSelection'
import { useTrackedProducts } from './hooks/useTrackedProducts'

export default function App() {
  const [exportState, setExportState] = useState({ status: 'idle', error: '' })
  const {
    products,
    status: trackedStatus,
    error: trackedError,
    addProducts,
  } = useTrackedProducts()

  const {
    detailState,
    selectedOptionId,
    setSelectedOptionId,
    trackingState,
    handleSelectProduct,
    handleTrackOption,
    handleBulkTrackingComplete,
    configSectionRef,
  } = useProductSelection({ onProductsTracked: addProducts })

  async function handleExportAllHistory() {
    setExportState({ status: 'loading', error: '' })

    try {
      const blob = await downloadAllTrackedProductsHistoryCsv()
      const objectUrl = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = 'all-tracked-products-scrape-history.csv'
      document.body.append(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(objectUrl)
      setExportState({ status: 'idle', error: '' })
    } catch (error) {
      setExportState({ status: 'error', error: error.message })
    }
  }

  return (
    <main className="w-[min(100%-32px,960px)] mx-auto pt-10 sm:pt-16 pb-20">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="flex items-start justify-between gap-4 mb-8 sm:mb-12">
        <div className="max-w-[640px]">
          <h1 className="text-[clamp(2.25rem,5vw,3.75rem)] font-bold tracking-[-0.045em] leading-[1.05] mb-4 text-brand-heading">
            Product Price Tracker
          </h1>
          <p className="text-brand-muted text-[1.1rem] leading-[1.6] mt-0">
            Find an INE store product, choose its option, and prepare it for price and stock tracking.
          </p>
        </div>

        <div className="shrink-0 mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportAllHistory}
            disabled={trackedStatus !== 'success' || exportState.status === 'loading'}
            className="bg-brand-surface border border-brand-border-strong text-brand-accent-strong font-semibold rounded-[9px] px-4 py-[11px] cursor-pointer hover:not-disabled:bg-brand-accent-soft hover:not-disabled:border-brand-accent transition-colors disabled:opacity-55 disabled:cursor-not-allowed text-sm focus-visible:outline-3 focus-visible:outline-brand-focus focus-visible:outline-offset-2"
          >
            {exportState.status === 'loading' ? 'Preparing CSV…' : 'Export all CSV'}
          </button>
          <AlertsBell />
        </div>
      </header>

      {exportState.status === 'error' && (
        <p className="rounded-[10px] mb-6 px-4 py-[13px] bg-brand-error-bg text-brand-error text-sm" role="alert">
          {exportState.error}
        </p>
      )}

      {/* ── Search ─────────────────────────────────────────────────────────── */}
      <ProductSearch onSelectProduct={handleSelectProduct} />

      {/* ── Product Config ─────────────────────────────────────────────────── */}
      <ProductConfiguration
        ref={configSectionRef}
        detailState={detailState}
        selectedOptionId={selectedOptionId}
        onSelectOption={setSelectedOptionId}
        trackingState={trackingState}
        onTrackOption={handleTrackOption}
        onBulkTracked={handleBulkTrackingComplete}
      />

      {/* ── Tracked Products ────────────────────────────────────────────────── */}
      <TrackedProducts
        products={products}
        status={trackedStatus}
        error={trackedError}
      />
    </main>
  )
}
