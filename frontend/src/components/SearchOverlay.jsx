import { useEffect, useRef, useState } from 'react'
import { searchProducts } from '../api'
import { formatProductMeta } from '../utils/formatters'

const SEARCH_DEBOUNCE_MS = 150

export function SearchOverlay({ onSelectProduct }) {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [searchState, setSearchState] = useState({ status: 'idle', data: null, error: '' })

  const containerRef = useRef(null)
  const searchRequestId = useRef(0)
  const searchTimer = useRef(null)

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('pointerdown', handleClickOutside)
    return () => {
      document.removeEventListener('pointerdown', handleClickOutside)
    }
  }, [])

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  // Run search
  const performSearch = async (searchQuery, targetPage = 1) => {
    const trimmed = searchQuery.trim()
    if (!trimmed) {
      setSearchState({ status: 'idle', data: null, error: '' })
      setIsOpen(false)
      return
    }

    const requestId = ++searchRequestId.current
    setSearchState((prev) => ({ ...prev, status: 'loading', error: '' }))
    setIsOpen(true)

    try {
      const data = await searchProducts(trimmed, { page: targetPage })
      if (requestId === searchRequestId.current) {
        setSearchState({ status: 'success', data, error: '' })
        setPage(targetPage)
      }
    } catch (err) {
      if (requestId === searchRequestId.current) {
        setSearchState({ status: 'error', data: null, error: err.message || 'Failed to search products' })
      }
    }
  }

  // Debounced input change
  function handleInputChange(e) {
    const nextQuery = e.target.value
    setQuery(nextQuery)
    setPage(1)

    if (searchTimer.current) {
      clearTimeout(searchTimer.current)
    }

    if (!nextQuery.trim()) {
      setSearchState({ status: 'idle', data: null, error: '' })
      setIsOpen(false)
      return
    }

    setIsOpen(true)
    searchTimer.current = setTimeout(() => {
      performSearch(nextQuery, 1)
    }, SEARCH_DEBOUNCE_MS)
  }

  function handleFormSubmit(e) {
    e.preventDefault()
    if (searchTimer.current) {
      clearTimeout(searchTimer.current)
    }
    performSearch(query, 1)
  }

  function handleSelect(product) {
    // Immediately hide the dropdown overlay
    setIsOpen(false)
    setQuery('')
    setSearchState({ status: 'idle', data: null, error: '' })
    onSelectProduct(product.productId)
  }

  const products = searchState.data?.products ?? []
  const total = searchState.data?.total ?? 0
  const totalPages = searchState.data?.totalPages ?? 1

  return (
    <div className="relative w-full" ref={containerRef}>
      <form className="flex gap-2.5 items-stretch w-full" onSubmit={handleFormSubmit} role="search">
        <label className="sr-only" htmlFor="product-search-input">
          Search for an INE product
        </label>
        <div className="relative flex-1 flex items-center">
          <svg
            className="left-3.5 pointer-events-none absolute h-4 w-4 text-brand-muted"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="6" />
            <path d="m16 16 4 4" />
          </svg>
          <input
            id="product-search-input"
            type="text"
            inputMode="search"
            enterKeyHint="search"
            value={query}
            onChange={handleInputChange}
            onFocus={() => {
              if (query.trim() && searchState.status !== 'idle') {
                setIsOpen(true)
              }
            }}
            placeholder="Search store catalog (e.g. camera, headlamp, desk chair)..."
            autoComplete="off"
            aria-autocomplete="list"
            aria-controls="search-dropdown-menu"
            aria-expanded={isOpen}
            className="w-full bg-brand-input border border-brand-border rounded-lg text-brand-text pl-9 pr-8 py-2 text-xs sm:text-sm focus:outline-none focus:border-brand-heading focus:ring-2 focus:ring-brand-focus appearance-none shadow-2xs transition-all"
          />
          {query && (
            <button
              type="button"
              className="bg-transparent border-0 text-brand-muted cursor-pointer text-xs px-2 py-1 absolute right-2 hover:text-brand-heading rounded transition-colors"
              onClick={() => {
                setQuery('')
                setIsOpen(false)
                setSearchState({ status: 'idle', data: null, error: '' })
              }}
              aria-label="Clear search input"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
        <button
          type="submit"
          className="shrink-0 bg-brand-lime hover:bg-brand-lime-hover border border-brand-lime text-brand-black font-bold rounded-lg px-4 py-2 cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed text-xs shadow-2xs active:scale-98 flex items-center gap-1.5"
          disabled={searchState.status === 'loading' || !query.trim()}
        >
          {searchState.status === 'loading' ? (
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full border-2 border-brand-black border-t-transparent animate-spin inline-block" />
              Searching…
            </span>
          ) : (
            'Search'
          )}
        </button>
      </form>

      {/* Dropdown Overlay - Positioned absolute directly below search input */}
      {isOpen && (
        <div
          id="search-dropdown-menu"
          className="bg-brand-surface border border-brand-border rounded-xl shadow-xl left-0 max-h-[360px] overflow-y-auto absolute right-0 top-[calc(100%+6px)] z-50 animate-in fade-in zoom-in-95 duration-150"
          role="region"
          aria-label="Search suggestions"
        >
          {searchState.status === 'loading' && (
            <div className="flex flex-row items-center justify-start gap-2.5 px-4 py-4 text-brand-muted text-xs bg-brand-surface-subtle">
              <span className="w-3.5 h-3.5 rounded-full border-2 border-brand-border-strong border-t-brand-dark animate-spin inline-block shrink-0" aria-hidden="true" />
              <span>Searching catalog for "{query.trim()}"…</span>
            </div>
          )}

          {searchState.status === 'error' && (
            <div className="flex flex-col items-center gap-2 px-5 py-6 text-center text-brand-error text-xs">
              <p className="font-bold m-0 mb-1">Search request failed</p>
              <p className="text-xs m-0 mb-2.5 text-brand-muted">{searchState.error}</p>
              <button
                type="button"
                className="bg-brand-surface border border-brand-border-strong text-brand-heading font-semibold rounded-lg px-3 py-1.5 text-xs cursor-pointer hover:bg-brand-surface-subtle transition-colors shadow-2xs"
                onClick={() => performSearch(query, page)}
              >
                Retry search
              </button>
            </div>
          )}

          {searchState.status === 'success' && products.length === 0 && (
            <div className="flex flex-col items-center gap-1.5 px-5 py-7 text-center text-brand-muted text-xs">
              <div className="w-8 h-8 rounded-full bg-brand-subtle flex items-center justify-center text-brand-muted mb-1">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="11" cy="11" r="6" />
                  <path d="m16 16 4 4" />
                </svg>
              </div>
              <p className="font-bold m-0 text-brand-heading text-xs">No products found for "{query.trim()}"</p>
              <p className="m-0 text-[0.72rem] text-brand-muted">Try checking spelling or using a broader product term.</p>
            </div>
          )}

          {searchState.status === 'success' && products.length > 0 && (
            <div className="py-1.5">
              <div className="flex items-center justify-between text-[0.72rem] text-brand-muted px-4 pt-1.5 pb-2 border-b border-brand-border bg-brand-surface-subtle font-medium">
                <span>{total} matching product{total === 1 ? '' : 's'}</span>
                {totalPages > 1 && (
                  <span className="text-[0.72rem] text-brand-heading font-semibold">Page {page} of {totalPages}</span>
                )}
              </div>

              <ul className="list-none m-0 p-0 px-1.5 py-1.5 flex flex-col gap-1" role="listbox">
                {products.map((product) => (
                  <li key={product.productId} role="option" aria-selected="false">
                    <button
                      type="button"
                      className="w-full flex items-center justify-between gap-2.5 text-left p-2.5 rounded-lg border border-transparent cursor-pointer transition-all hover:bg-brand-surface-subtle hover:border-brand-border text-brand-text bg-transparent font-normal group active:scale-[0.99]"
                      onClick={() => handleSelect(product)}
                    >
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-brand-heading font-bold text-xs sm:text-sm truncate group-hover:text-brand-black">
                          {product.name}
                        </span>
                        <span className="text-brand-muted text-[0.72rem] font-medium">
                          {formatProductMeta(product)}
                        </span>
                      </div>
                      <span className="bg-brand-lime-soft text-brand-dark group-hover:bg-brand-lime group-hover:text-brand-black transition-colors rounded-full text-[0.68rem] font-bold px-2.5 py-1 shrink-0 flex items-center gap-1 shadow-2xs" aria-hidden="true">
                        Select →
                      </span>
                    </button>
                  </li>
                ))}
              </ul>

              {totalPages > 1 && (
                <div className="flex items-center justify-between gap-2 border-t border-brand-border mt-1 px-4 py-2 bg-brand-surface-subtle">
                  <button
                    type="button"
                    className="bg-brand-surface border border-brand-border text-brand-heading font-bold rounded-lg px-2.5 py-1 text-xs cursor-pointer hover:bg-brand-surface-subtle transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs"
                    disabled={page <= 1 || searchState.status === 'loading'}
                    onClick={() => performSearch(query, page - 1)}
                  >
                    ← Prev
                  </button>
                  <span className="text-brand-muted text-[0.72rem] font-semibold">{page} / {totalPages}</span>
                  <button
                    type="button"
                    className="bg-brand-surface border border-brand-border text-brand-heading font-bold rounded-lg px-2.5 py-1 text-xs cursor-pointer hover:bg-brand-surface-subtle transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs"
                    disabled={page >= totalPages || searchState.status === 'loading'}
                    onClick={() => performSearch(query, page + 1)}
                  >
                    Next →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
