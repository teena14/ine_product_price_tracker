import { SearchOverlay } from './SearchOverlay'

export function ProductSearch({ onSelectProduct }) {
  return (
    <section
      className="border border-brand-border rounded-2xl bg-brand-surface shadow-[0_2px_8px_rgb(25_39_52/0.04)] grid gap-6 grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)] items-stretch md:items-start p-5 sm:p-7 relative overflow-visible"
      aria-labelledby="search-heading"
    >
      <div>
        <h2 id="search-heading" className="text-xl font-bold tracking-[-0.02em] mb-1.5 text-brand-heading">
          Find a product
        </h2>
        <p className="text-brand-muted mt-0 text-sm sm:text-base">
          Search by a full or partial product name.
        </p>
      </div>
      <SearchOverlay onSelectProduct={onSelectProduct} />
    </section>
  )
}
