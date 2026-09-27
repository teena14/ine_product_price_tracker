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
    <section className="mt-10" aria-labelledby="tracked-heading">
      <div className="flex items-start justify-between gap-4 mb-3">
        <h2 id="tracked-heading" className="flex items-center gap-2.5 text-xl font-bold tracking-[-0.02em] text-brand-heading">
          Tracked Products
          {status === 'success' && (
            <span className="bg-brand-accent-soft rounded-full text-brand-accent-strong text-[0.8rem] font-bold px-[9px] py-[3px]">
              {products.length}
            </span>
          )}
        </h2>
      </div>

      {/* List controls */}
      {status === 'success' && products.length > 0 && (
        <TrackedProductFilters
          query={listQuery}
          onQueryChange={handleListQueryChange}
          filter={listFilter}
          onFilterChange={handleListFilterChange}
          sort={listSort}
          onSortChange={handleListSortChange}
        />
      )}

      {/* Loading / error states */}
      {status === 'loading' && (
        <p className="rounded-[10px] my-5 px-4 py-[13px] bg-brand-info-bg text-brand-info text-sm" role="status">
          Loading tracked products…
        </p>
      )}
      {status === 'error' && (
        <p className="rounded-[10px] my-5 px-4 py-[13px] bg-brand-error-bg text-brand-error text-sm" role="alert">
          {error}
        </p>
      )}

      {/* Empty state: no products */}
      {status === 'success' && products.length === 0 && (
        <div className="bg-brand-subtle rounded-[10px] p-7 text-center">
          <h3 className="text-base font-bold text-brand-heading mb-1.5">No products tracked yet</h3>
          <p className="text-brand-muted text-sm mt-0">
            Search for a product above, select a variant, and click <strong>Track Product</strong> to get started.
          </p>
        </div>
      )}

      {/* Empty state: filters returned nothing */}
      {status === 'success' && products.length > 0 && totalFiltered === 0 && (
        <div className="bg-brand-subtle rounded-[10px] p-7 text-center">
          <h3 className="text-base font-bold text-brand-heading mb-1.5">No results</h3>
          <p className="text-brand-muted text-sm mt-0">
            No tracked products match your current search or filter. Try adjusting them.
          </p>
        </div>
      )}

      {/* Products list + pagination */}
      {status === 'success' && pageProducts.length > 0 && (
        <>
          <p className="text-brand-muted text-[0.85rem] mb-3 mt-8" aria-live="polite">
            Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, totalFiltered)} of {totalFiltered}
          </p>

          <ul className="grid gap-2 list-none m-0 p-0">
            {pageProducts.map((product) => (
              <li key={product.id}>
                <TrackedCard product={product} />
              </li>
            ))}
          </ul>

          <Pagination
            currentPage={safePage}
            totalPages={totalPages}
            onPrev={() => setListPage((p) => p - 1)}
            onNext={() => setListPage((p) => p + 1)}
          />
        </>
      )}
    </section>
  )
}
