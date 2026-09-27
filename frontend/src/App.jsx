import { ProductConfiguration } from './components/ProductConfiguration'
import { ProductSearch } from './components/ProductSearch'
import { TrackedProducts } from './components/TrackedProducts'
import { useProductSelection } from './hooks/useProductSelection'
import { useTrackedProducts } from './hooks/useTrackedProducts'

export default function App() {
  const {
    products,
    status: trackedStatus,
    error: trackedError,
    addProduct,
  } = useTrackedProducts()

  const {
    detailState,
    selectedOptionId,
    setSelectedOptionId,
    trackingState,
    handleSelectProduct,
    handleTrackOption,
    configSectionRef,
  } = useProductSelection({ onProductTracked: addProduct })

  return (
    <main className="w-[min(100%-32px,960px)] mx-auto pt-10 sm:pt-16 pb-20">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="max-w-[680px] mb-8 sm:mb-12">
        <h1 className="text-[clamp(2.25rem,5vw,3.75rem)] font-bold tracking-[-0.045em] leading-[1.05] mb-4 text-brand-heading">
          Product Price Tracker
        </h1>
        <p className="text-brand-muted text-[1.1rem] leading-[1.6] mt-0">
          Find an INE store product, choose its option, and prepare it for price and stock tracking.
        </p>
      </header>

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
