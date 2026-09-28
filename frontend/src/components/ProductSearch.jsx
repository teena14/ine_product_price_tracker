import { SearchOverlay } from './SearchOverlay'

export function ProductSearch({ onSelectProduct }) {
  return (
    <section
      id="catalog-search"
      className="border border-brand-border rounded-xl bg-brand-surface card-elevation grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(340px,1.2fr)] items-start p-4 sm:p-5 relative overflow-visible transition-all"
      aria-labelledby="search-heading"
    >
      <div>
        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-brand-lime-soft text-brand-dark text-[0.68rem] font-bold tracking-wider uppercase mb-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-dark" />
          Catalog Explorer
        </div>
        <h2 id="search-heading" className="text-base sm:text-lg font-bold tracking-tight text-brand-heading mb-1">
          Find &amp; Track a Product
        </h2>
        <p className="text-brand-muted text-xs leading-relaxed m-0">
          Search the live INE store catalog by product title, brand, or keyword to monitor price shifts and stock status.
        </p>
      </div>
      <SearchOverlay onSelectProduct={onSelectProduct} />
    </section>
  )
}

