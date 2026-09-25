import { useState } from 'react'
import { getProduct, searchProducts } from './api'
import './App.css'

function formatProductMeta(product) {
  return [product.brand, product.category, product.sku].filter(Boolean).join(' · ')
}

function App() {
  const [query, setQuery] = useState('')
  const [searchState, setSearchState] = useState({ status: 'idle', data: null, error: '' })
  const [detailState, setDetailState] = useState({ status: 'idle', data: null, error: '' })
  const [selectedOptionId, setSelectedOptionId] = useState('')

  async function handleSearch(event) {
    event.preventDefault()
    const searchQuery = query.trim()

    if (!searchQuery) {
      setSearchState({ status: 'error', data: null, error: 'Enter a product name to search.' })
      return
    }

    setSearchState({ status: 'loading', data: null, error: '' })
    setDetailState({ status: 'idle', data: null, error: '' })
    setSelectedOptionId('')

    try {
      const data = await searchProducts(searchQuery)
      setSearchState({ status: 'success', data, error: '' })
    } catch (error) {
      setSearchState({ status: 'error', data: null, error: error.message })
    }
  }

  async function handleSelectProduct(productId) {
    setDetailState({ status: 'loading', data: null, error: '' })
    setSelectedOptionId('')

    try {
      const data = await getProduct(productId)
      setDetailState({ status: 'success', data, error: '' })
    } catch (error) {
      setDetailState({ status: 'error', data: null, error: error.message })
    }
  }

  const products = searchState.data?.products ?? []
  const selectedProduct = detailState.data
  const selectedOption = selectedProduct?.options.find(
    (option) => option.optionId === selectedOptionId
  )

  return (
    <main className="app-shell">
      <header className="page-header">
        <p className="eyebrow">INE SOFTWARE ENGINEER INTERN ASSIGNMENT</p>
        <h1>Product Price Tracker</h1>
        <p className="intro">
          Find an INE store product, choose its option, and prepare it for price and stock tracking.
        </p>
      </header>

      <section className="search-panel" aria-labelledby="search-heading">
        <div>
          <h2 id="search-heading">Find a product</h2>
          <p>Search by a full or partial product name.</p>
        </div>
        <form className="search-form" onSubmit={handleSearch}>
          <label className="visually-hidden" htmlFor="product-search">
            Product name
          </label>
          <input
            id="product-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="e.g. camera or headlamp"
            autoComplete="off"
          />
          <button type="submit" disabled={searchState.status === 'loading'}>
            {searchState.status === 'loading' ? 'Searching…' : 'Search'}
          </button>
        </form>
      </section>

      {searchState.status === 'error' && <p className="message error" role="alert">{searchState.error}</p>}

      {searchState.status === 'success' && (
        <section className="results-section" aria-live="polite" aria-labelledby="results-heading">
          <div className="section-heading">
            <div>
              <h2 id="results-heading">Search results</h2>
              <p>{searchState.data.total} matching product{searchState.data.total === 1 ? '' : 's'} found</p>
            </div>
            {searchState.data.totalPages > 1 && (
              <span className="page-indicator">Page {searchState.data.page} of {searchState.data.totalPages}</span>
            )}
          </div>

          {products.length === 0 ? (
            <div className="empty-state">
              <h3>No products found</h3>
              <p>Try a broader name or check the spelling.</p>
            </div>
          ) : (
            <ul className="product-list">
              {products.map((product) => (
                <li key={product.productId}>
                  <button
                    type="button"
                    className={`product-card ${selectedProduct?.productId === product.productId ? 'is-selected' : ''}`}
                    onClick={() => handleSelectProduct(product.productId)}
                    aria-pressed={selectedProduct?.productId === product.productId}
                  >
                    <span className="product-name">{product.name}</span>
                    <span className="product-meta">{formatProductMeta(product)}</span>
                    <span className="select-label">Choose product <span aria-hidden="true">→</span></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {detailState.status === 'loading' && <p className="message loading" role="status">Loading product options…</p>}
      {detailState.status === 'error' && <p className="message error" role="alert">{detailState.error}</p>}

      {detailState.status === 'success' && (
        <section className="selection-panel" aria-labelledby="selection-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">SELECTED PRODUCT</p>
              <h2 id="selection-heading">{selectedProduct.name}</h2>
              <p>{formatProductMeta(selectedProduct)}</p>
            </div>
            <a href={selectedProduct.productUrl} target="_blank" rel="noreferrer">
              View in store <span aria-hidden="true">↗</span>
            </a>
          </div>

          {selectedProduct.description && <p className="product-description">{selectedProduct.description}</p>}

          {selectedProduct.options.length === 0 ? (
            <p className="message error" role="alert">This product has no trackable options.</p>
          ) : (
            <fieldset className="option-fieldset">
              <legend>Select {selectedProduct.optionAxis || 'an option'}</legend>
              <div className="option-list">
                {selectedProduct.options.map((option) => (
                  <label key={option.optionId} className={`option-choice ${selectedOptionId === option.optionId ? 'is-selected' : ''}`}>
                    <input
                      type="radio"
                      name="product-option"
                      value={option.optionId}
                      checked={selectedOptionId === option.optionId}
                      onChange={() => setSelectedOptionId(option.optionId)}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <div className="tracking-preview" aria-live="polite">
            <div>
              <h3>{selectedOption ? `${selectedProduct.name} — ${selectedOption.label}` : 'Choose an option to continue'}</h3>
              <p>
                {selectedOption
                  ? 'This selection is ready to be saved in the next phase.'
                  : 'Each option can have its own price and stock level.'}
              </p>
            </div>
            <button type="button" disabled title="Saving tracked products is added in the next phase.">
              Track option
            </button>
          </div>
        </section>
      )}
    </main>
  )
}

export default App
