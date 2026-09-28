import { TrackedCard } from './TrackedCard'

export function RecentlyAddedProducts({
  products = [],
  status = 'idle',
}) {
  const recentProducts = products.slice(0, 4)

  return (
    <section className="flex-1 min-h-0 flex flex-col overflow-hidden mt-7 sm:mt-4" aria-labelledby="recent-products-heading">
      {/* Section Header */}
      <div className="flex items-center justify-between gap-3 mb-2.5 shrink-0">
        <h2
          id="recent-products-heading"
          className="text-base sm:text-lg font-bold tracking-tight text-brand-heading m-0 flex items-center gap-2"
        >
          <span>Recently Added Products</span>
          {products.length > 0 && (
            <span className="bg-brand-lime text-brand-black rounded-full text-[0.68rem] font-black px-2 py-0.5 shadow-2xs">
              {recentProducts.length} of {products.length}
            </span>
          )}
        </h2>
      </div>

      {/* Loading state */}
      {status === 'loading' && (
        <div className="rounded-xl p-4 bg-brand-surface border border-brand-border flex items-center justify-center gap-2 text-brand-muted text-xs shadow-2xs shrink-0">
          <span className="w-3.5 h-3.5 rounded-full border-2 border-brand-border-strong border-t-brand-dark animate-spin inline-block" />
          <span>Loading recent products…</span>
        </div>
      )}

      {/* Empty state */}
      {status === 'success' && products.length === 0 && (
        <div className="bg-brand-surface border border-brand-border rounded-xl p-5 text-center card-elevation my-auto shrink-0">
          <div className="w-8 h-8 rounded-lg bg-brand-lime-soft text-brand-dark flex items-center justify-center mx-auto mb-1.5 shadow-2xs">
            <svg className="w-4 h-4 text-brand-dark" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
          </div>
          <h3 className="text-xs sm:text-sm font-bold text-brand-heading mb-0.5">No products tracked yet</h3>
          <p className="text-brand-muted text-[0.72rem] max-w-[340px] mx-auto m-0 leading-relaxed">
            Search for an INE store item above, choose a variant option, and click <strong>Track Product</strong> to start monitoring.
          </p>
        </div>
      )}

      {/* Internal scrollable list for recent cards */}
      {status === 'success' && recentProducts.length > 0 && (
        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
          <div className="flex flex-col gap-2 pb-1">
            {recentProducts.map((product) => (
              <TrackedCard key={product.id} product={product} />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
