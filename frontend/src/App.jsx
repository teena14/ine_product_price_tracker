import { useState } from 'react'
import { downloadAllTrackedProductsHistoryCsv } from './api'
import { AlertsBell } from './components/AlertsBell'
import { ProductConfiguration } from './components/ProductConfiguration'
import { ProductSearch } from './components/ProductSearch'
import { RecentlyAddedProducts } from './components/RecentlyAddedProducts'
import { TrackedProducts } from './components/TrackedProducts'
import { useProductSelection } from './hooks/useProductSelection'
import { useTrackedProducts } from './hooks/useTrackedProducts'

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard')
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
    <div className="h-screen w-screen overflow-hidden bg-brand-canvas flex flex-col lg:flex-row font-sans text-brand-text">
      {/* ── Left Sidebar (Dark Palette #000000 / #111418) ──────────────────── */}
      <aside className="w-full lg:w-64 bg-brand-dark text-white lg:h-screen shrink-0 p-4 sm:p-5 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-brand-dark-border z-20 overflow-hidden">
        <div>
          {/* Logo & Brand Header */}
          <div className="flex items-center justify-between lg:justify-start gap-2.5 mb-5 pb-3 border-b border-brand-dark-border">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-brand-lime flex items-center justify-center text-brand-black shadow-xs font-black text-base shrink-0">
                <svg className="w-4 h-4 text-brand-black" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              </div>
              <div>
                <span className="font-bold text-sm tracking-tight text-white block">PricePulse</span>
                <span className="text-[0.62rem] tracking-wider text-brand-dark-muted uppercase font-semibold block">INE TRACKER</span>
              </div>
            </div>

            {/* Mobile Alert Bell */}
            <div className="lg:hidden flex items-center gap-2">
              <AlertsBell />
            </div>
          </div>

          {/* Navigation Links: Dashboard + Tracked Products */}
          <nav className="flex flex-row lg:flex-col gap-1.5" aria-label="Main Navigation">
            <button
              type="button"
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-bold w-full text-left transition-all cursor-pointer shrink-0 ${
                activeTab === 'dashboard'
                  ? 'bg-brand-lime text-brand-black shadow-xs'
                  : 'text-brand-dark-muted hover:text-white hover:bg-brand-dark-surface'
              }`}
            >
              <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect width="7" height="9" x="3" y="3" rx="1" />
                <rect width="7" height="5" x="14" y="3" rx="1" />
                <rect width="7" height="9" x="14" y="12" rx="1" />
                <rect width="7" height="5" x="3" y="16" rx="1" />
              </svg>
              <span>Dashboard</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('tracked')}
              className={`flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold w-full text-left transition-all cursor-pointer shrink-0 ${
                activeTab === 'tracked'
                  ? 'bg-brand-lime text-brand-black shadow-xs'
                  : 'text-brand-dark-muted hover:text-white hover:bg-brand-dark-surface'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0 truncate">
                <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                <span className="truncate">Tracked Products</span>
              </div>
              {products.length > 0 && (
                <span
                  className={`rounded-full text-[0.62rem] font-black px-1.5 py-0.2 shrink-0 ${
                    activeTab === 'tracked'
                      ? 'bg-brand-black text-white'
                      : 'bg-brand-dark-surface text-brand-dark-muted border border-brand-dark-border'
                  }`}
                >
                  {products.length}
                </span>
              )}
            </button>
          </nav>
        </div>

        {/* Bottom Sidebar Quick Info */}
        <div className="hidden lg:block mt-6">
          <div className="bg-brand-dark-surface border border-brand-dark-border rounded-xl p-3.5 shadow-2xs">
            <h4 className="text-xs font-bold text-white mb-0.5">INE Store Monitor</h4>
            <p className="text-[0.72rem] text-brand-dark-muted leading-relaxed mb-2.5">
              Real-time product price &amp; inventory tracking.
            </p>
            <button
              type="button"
              onClick={handleExportAllHistory}
              disabled={trackedStatus !== 'success' || exportState.status === 'loading'}
              className="w-full bg-brand-lime hover:bg-brand-lime-hover text-brand-black font-bold text-xs py-2 px-3 rounded-lg transition-all shadow-2xs flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
            >
              <span>{exportState.status === 'loading' ? 'Exporting…' : 'Export CSV'}</span>
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main Dashboard Content Area (Single Page, zero outer scroll) ────── */}
      <main className="flex-1 h-screen flex flex-col overflow-hidden p-3.5 sm:p-5 lg:p-6 max-w-[1240px] w-full mx-auto min-w-0">
        {/* Top Header Row */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-3 pb-2 shrink-0">
          <div>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-brand-heading flex items-center gap-2.5 m-0">
              {activeTab === 'dashboard' ? (
                <span>Welcome back</span>
              ) : (
                <>
                  <span>Tracked Products</span>
                  {trackedStatus === 'success' && (
                    <span className="bg-brand-lime text-brand-black rounded-full text-xs font-black px-2.5 py-0.5 shadow-2xs ml-1">
                      {products.length}
                    </span>
                  )}
                </>
              )}
            </h1>
            <p className="text-brand-muted text-xs mt-0.5 mb-0 font-medium">
              {activeTab === 'dashboard'
                ? 'Search products, configure variant alerts, and monitor recent items.'
                : 'Live monitoring, pricing shifts, and inventory statuses.'}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
            {/* Desktop Alerts Bell */}
            <div className="hidden lg:block">
              <AlertsBell />
            </div>
          </div>
        </header>

        {exportState.status === 'error' && (
          <div className="rounded-xl mb-3 px-3 py-2 bg-brand-error-bg text-brand-error text-xs font-medium border border-brand-error/20 flex items-center gap-2 shrink-0" role="alert">
            <svg className="w-4 h-4 text-brand-error shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span>{exportState.error}</span>
          </div>
        )}

        {/* ── Content Switcher (Dashboard vs Tracked Products) ─────────────── */}
        {activeTab === 'dashboard' ? (
          <div className="flex-1 min-h-0 flex flex-col gap-3 overflow-hidden">
            {/* Search & Discovery Section (Fixed - does not scroll) */}
            <div className="shrink-0 flex flex-col gap-2">
              <ProductSearch onSelectProduct={handleSelectProduct} />

              {/* Product Configuration Section */}
              <ProductConfiguration
                ref={configSectionRef}
                detailState={detailState}
                selectedOptionId={selectedOptionId}
                onSelectOption={setSelectedOptionId}
                trackingState={trackingState}
                onTrackOption={handleTrackOption}
                onBulkTracked={handleBulkTrackingComplete}
              />
            </div>

            {/* Recently Added Products (Takes remaining height, ONLY cards scroll) */}
            <RecentlyAddedProducts
              products={products}
              status={trackedStatus}
            />
          </div>
        ) : (
          <TrackedProducts
            products={products}
            status={trackedStatus}
            error={trackedError}
          />
        )}
      </main>
    </div>
  )
}
