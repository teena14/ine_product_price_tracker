import { useState } from 'react'
import { Pagination } from './Pagination'
import { TrackedCard } from './TrackedCard'
import { TrackedProductFilters } from './TrackedProductFilters'

const PAGE_SIZE = 25

function filterAndSort(products, query, filter, sort) {
  let result = [...products]

  if (query.trim()) {
    const q = query.toLowerCase()
    result = result.filter(
      (p) =>
        p.product_name?.toLowerCase().includes(q) ||
        p.option_name?.toLowerCase().includes(q)
    )
  }

  if (filter === 'active') result = result.filter((p) => p.active)
  if (filter === 'paused') result = result.filter((p) => !p.active)

  if (sort === 'name_asc') {
    result.sort((a, b) => (a.product_name || '').localeCompare(b.product_name || ''))
  }

  return result
}

export function TrackedProducts({
  products = [],
  status = 'idle',
  error = '',
}) {
  const [listQuery, setListQuery] = useState('')
  const [listFilter, setListFilter] = useState('all')
  const [listSort, setListSort] = useState('recently_added')
  const [listPage, setListPage] = useState(1)

  const allFiltered = filterAndSort(products, listQuery, listFilter, listSort)
  const totalFiltered = allFiltered.length
  const totalPages = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE))
  const safePage = Math.min(listPage, totalPages)
  const pageProducts = allFiltered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  function handleListQueryChange(e) {
    setListQuery(e.target.value)
    setListPage(1)
  }

  function handleListFilterChange(filterValue) {
    setListFilter(filterValue)
    setListPage(1)
  }

  function handleListSortChange(e) {
    setListSort(e.target.value)
    setListPage(1)
  }

  return (
    <section id="tracked-products-section" className="flex-1 min-h-0 flex flex-col overflow-hidden" aria-label="Tracked Products">
      {/* List controls */}
      {status === 'success' && products.length > 0 && (
        <div className="shrink-0 mb-1">
          <TrackedProductFilters
            query={listQuery}
            onQueryChange={handleListQueryChange}
            filter={listFilter}
            onFilterChange={handleListFilterChange}
            sort={listSort}
            onSortChange={handleListSortChange}
          />
        </div>
      )}

      {/* Loading / error states */}
      {status === 'loading' && (
        <div className="rounded-xl my-4 p-5 bg-brand-surface border border-brand-border flex items-center justify-center gap-2.5 text-brand-muted text-xs shadow-2xs shrink-0" role="status">
          <span className="w-3.5 h-3.5 rounded-full border-2 border-brand-border-strong border-t-brand-dark animate-spin inline-block" />
          <span>Loading tracked products…</span>
        </div>
      )}
      {status === 'error' && (
        <div className="rounded-xl my-4 p-4 bg-brand-error-bg text-brand-error text-xs font-medium border border-brand-error/20 flex items-center gap-2.5 shrink-0" role="alert">
          <svg className="w-4 h-4 text-brand-error shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* Empty state: no products */}
      {status === 'success' && products.length === 0 && (
        <div className="bg-brand-surface border border-brand-border rounded-xl p-6 sm:p-8 text-center card-elevation my-auto">
          <div className="w-10 h-10 rounded-xl bg-brand-lime-soft text-brand-dark flex items-center justify-center mx-auto mb-2 shadow-2xs">
            <svg className="w-5 h-5 text-brand-dark" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
          </div>
          <h3 className="text-sm sm:text-base font-bold text-brand-heading mb-1">No products tracked yet</h3>
          <p className="text-brand-muted text-xs max-w-[380px] mx-auto m-0 leading-relaxed">
            Go to the <strong>Dashboard</strong> tab, search for an INE store item, select a variant option, and click <strong>Track Product</strong> to start monitoring.
          </p>
        </div>
      )}

      {/* Empty state: filters returned nothing */}
      {status === 'success' && products.length > 0 && totalFiltered === 0 && (
        <div className="bg-brand-surface border border-brand-border rounded-xl p-6 text-center card-elevation my-auto">
          <div className="w-8 h-8 rounded-lg bg-brand-subtle flex items-center justify-center mx-auto mb-2 text-brand-muted">
            <svg className="w-4 h-4 text-brand-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </div>
          <h3 className="text-xs sm:text-sm font-bold text-brand-heading mb-0.5">No matching results</h3>
          <p className="text-brand-muted text-[0.72rem] max-w-[320px] mx-auto m-0">
            No tracked products match your current search query or filter. Try clearing or adjusting them.
          </p>
        </div>
      )}

      {/* Internal scrollable list for cards */}
      {status === 'success' && pageProducts.length > 0 && (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between text-brand-muted text-[0.72rem] font-semibold mb-1.5 shrink-0" aria-live="polite">
            <span>Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, totalFiltered)} of {totalFiltered} items</span>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto pr-1">
            <ul className="grid gap-2 list-none m-0 p-0">
              {pageProducts.map((product) => (
                <li key={product.id}>
                  <TrackedCard product={product} />
                </li>
              ))}
            </ul>
          </div>

          <div className="shrink-0 pt-2">
            <Pagination
              currentPage={safePage}
              totalPages={totalPages}
              onPrev={() => setListPage((p) => p - 1)}
              onNext={() => setListPage((p) => p + 1)}
            />
          </div>
        </div>
      )}
    </section>
  )
}
