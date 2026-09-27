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
          <span className="left-3 pointer-events-none absolute text-[0.9rem] opacity-50" aria-hidden="true">
            🔍
          </span>
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
            className="w-full bg-brand-input border border-brand-border-strong rounded-[9px] text-brand-text pl-9 pr-9 py-[11px] text-sm focus:outline-3 focus:outline-brand-focus focus:outline-offset-2 appearance-none"
          />
          {query && (
            <button
              type="button"
              className="bg-transparent border-0 text-brand-muted cursor-pointer text-[0.85rem] px-1.5 py-1 absolute right-2 hover:text-brand-text focus-visible:outline-3 focus-visible:outline-brand-focus focus-visible:outline-offset-2 rounded"
              onClick={() => {
                setQuery('')
                setIsOpen(false)
                setSearchState({ status: 'idle', data: null, error: '' })
              }}
              aria-label="Clear search input"
            >
              ✕
            </button>
          )}
        </div>
        <button
          type="submit"
          className="shrink-0 bg-brand-accent hover:not-disabled:bg-brand-accent-strong border border-brand-accent hover:not-disabled:border-brand-accent-strong rounded-[9px] text-white font-bold px-4 py-[11px] cursor-pointer transition-colors disabled:opacity-55 disabled:cursor-not-allowed text-sm focus-visible:outline-3 focus-visible:outline-brand-focus focus-visible:outline-offset-2"
          disabled={searchState.status === 'loading' || !query.trim()}
        >
          {searchState.status === 'loading' ? 'Searching…' : 'Search'}
        </button>
      </form>

      {/* Dropdown Overlay - Positioned absolute directly below search input */}
      {isOpen && (
        <div
          id="search-dropdown-menu"
          className="bg-brand-surface border border-brand-border-strong rounded-xl shadow-[0_8px_32px_rgb(25_39_52/0.12)] left-0 max-h-[380px] overflow-y-auto absolute right-0 top-[calc(100%+6px)] z-50"
          role="region"
          aria-label="Search suggestions"
        >
          {searchState.status === 'loading' && (
            <div className="flex flex-row items-center justify-start gap-2.5 px-5 py-4 text-brand-muted text-sm">
              <span className="w-3.5 h-3.5 rounded-full border-2 border-brand-border-strong border-t-brand-accent animate-spin inline-block shrink-0" aria-hidden="true" />
              <span>Searching INE store catalog for "{query.trim()}"…</span>
            </div>
          )}

          {searchState.status === 'error' && (
            <div className="flex flex-col items-center gap-2.5 px-5 py-7 text-center text-brand-error text-sm">
              <p className="font-bold m-0 mb-1">Search request failed</p>
              <p className="text-[0.85rem] m-0 mb-3">{searchState.error}</p>
              <button
                type="button"
                className="bg-brand-surface border border-brand-border-strong text-brand-accent-strong font-semibold rounded-[9px] px-3 py-1.5 text-[0.82rem] cursor-pointer hover:not-disabled:bg-brand-accent-soft hover:not-disabled:border-brand-accent transition-colors disabled:opacity-55 disabled:cursor-not-allowed focus-visible:outline-3 focus-visible:outline-brand-focus focus-visible:outline-offset-2"
                onClick={() => performSearch(query, page)}
              >
                Retry search
              </button>
            </div>
          )}

          {searchState.status === 'success' && products.length === 0 && (
            <div className="flex flex-col items-center gap-2.5 px-5 py-7 text-center text-brand-muted text-sm">
              <p className="font-bold m-0 mb-1 text-brand-heading">No products found for "{query.trim()}"</p>
              <p className="m-0 text-[0.85rem]">Try a broader product keyword or check the spelling.</p>
            </div>
          )}

          {searchState.status === 'success' && products.length > 0 && (
            <div className="py-1">
              <div className="flex items-center justify-between text-xs text-brand-muted px-4 pt-2.5 pb-2">
                <span>{total} matching product{total === 1 ? '' : 's'}</span>
                {totalPages > 1 && (
                  <span className="text-[0.78rem]">Page {page} of {totalPages}</span>
                )}
              </div>

              <ul className="list-none m-0 p-0 px-2 pb-2 flex flex-col gap-1" role="listbox">
                {products.map((product) => (
                  <li key={product.productId} role="option" aria-selected="false">
                    <button
                      type="button"
                      className="w-full flex items-center justify-between gap-3 text-left p-2.5 sm:px-3 sm:py-2.5 rounded-[9px] border border-transparent cursor-pointer transition-colors hover:bg-brand-accent-soft hover:border-brand-accent-light text-brand-text bg-transparent font-normal focus-visible:outline-3 focus-visible:outline-brand-focus focus-visible:outline-offset-2"
                      onClick={() => handleSelect(product)}
                    >
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-brand-heading font-semibold text-[0.9rem] truncate">{product.name}</span>
                        <span className="text-brand-muted text-[0.8rem]">{formatProductMeta(product)}</span>
                      </div>
                      <span className="text-brand-accent-strong text-[0.82rem] font-semibold shrink-0" aria-hidden="true">
                        Select →
                      </span>
                    </button>
                  </li>
                ))}
              </ul>

              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2.5 border-t border-brand-border mt-1 px-4 py-2.5">
                  <button
                    type="button"
                    className="bg-brand-surface border border-brand-border-strong text-brand-accent-strong font-semibold rounded-[9px] px-3 py-1.5 text-[0.82rem] cursor-pointer hover:not-disabled:bg-brand-accent-soft hover:not-disabled:border-brand-accent transition-colors disabled:opacity-55 disabled:cursor-not-allowed focus-visible:outline-3 focus-visible:outline-brand-focus focus-visible:outline-offset-2"
                    disabled={page <= 1 || searchState.status === 'loading'}
                    onClick={() => performSearch(query, page - 1)}
                  >
                    ← Prev
                  </button>
                  <span className="text-brand-muted text-[0.82rem] font-bold">{page} / {totalPages}</span>
                  <button
                    type="button"
                    className="bg-brand-surface border border-brand-border-strong text-brand-accent-strong font-semibold rounded-[9px] px-3 py-1.5 text-[0.82rem] cursor-pointer hover:not-disabled:bg-brand-accent-soft hover:not-disabled:border-brand-accent transition-colors disabled:opacity-55 disabled:cursor-not-allowed focus-visible:outline-3 focus-visible:outline-brand-focus focus-visible:outline-offset-2"
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
