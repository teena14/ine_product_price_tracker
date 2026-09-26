import { useEffect, useState } from 'react'
import {
  createTrackedProduct,
  getProduct,
  getTrackedProductHistory,
  listTrackedProducts,
  searchProducts,
} from './api'
import './App.css'

function formatProductMeta(product) {
  return [product.brand, product.category, product.sku].filter(Boolean).join(' · ')
}

function formatTimestamp(value) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Unknown time'
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(date)
}

function formatPrice(value) {
  const price = Number(value)

  if (!Number.isFinite(price)) {
    return '—'
  }

  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(price)
}

function formatStock(value) {
  return Number.isSafeInteger(value) ? String(value) : '—'
}

function formatDuration(value) {
  return Number.isSafeInteger(value) ? `${value.toLocaleString()} ms` : '—'
}

function outcomeLabel(outcome) {
  return outcome === 'success' ? 'Success' : outcome === 'retried' ? 'Retried' : 'Failed'
}

function App() {
  const [query, setQuery] = useState('')
  const [searchState, setSearchState] = useState({ status: 'idle', data: null, error: '' })
  const [detailState, setDetailState] = useState({ status: 'idle', data: null, error: '' })
  const [selectedOptionId, setSelectedOptionId] = useState('')
  const [trackingState, setTrackingState] = useState({ status: 'idle', error: '' })
  const [trackedProductsState, setTrackedProductsState] = useState({
    status: 'loading',
    products: [],
    error: '',
  })
  const [historyState, setHistoryState] = useState({ status: 'idle', data: null, error: '' })

  useEffect(() => {
    async function loadTrackedProducts() {
      try {
        const data = await listTrackedProducts()
        setTrackedProductsState({ status: 'success', products: data.trackedProducts, error: '' })
      } catch (error) {
        setTrackedProductsState({ status: 'error', products: [], error: error.message })
      }
    }

    loadTrackedProducts()
  }, [])

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
    setTrackingState({ status: 'idle', error: '' })

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
    setTrackingState({ status: 'idle', error: '' })

    try {
      const data = await getProduct(productId)
      setDetailState({ status: 'success', data, error: '' })
    } catch (error) {
      setDetailState({ status: 'error', data: null, error: error.message })
    }
  }

  async function handleTrackOption() {
    if (!selectedProduct || !selectedOption) {
      return
    }

    setTrackingState({ status: 'loading', error: '' })

    try {
      const trackedProduct = await createTrackedProduct({
        productId: selectedProduct.productId,
        optionId: selectedOption.optionId,
      })
      setTrackedProductsState((current) => ({
        status: 'success',
        products: [trackedProduct, ...current.products],
        error: '',
      }))
      setHistoryState({ status: 'idle', data: null, error: '' })
      setTrackingState({ status: 'success', error: '' })
    } catch (error) {
      setTrackingState({ status: 'error', error: error.message })
    }
  }

  async function handleShowHistory(trackedProductId) {
    setHistoryState({ status: 'loading', data: null, error: '' })

    try {
      const data = await getTrackedProductHistory(trackedProductId)
      setHistoryState({ status: 'success', data, error: '' })
    } catch (error) {
      setHistoryState({ status: 'error', data: null, error: error.message })
    }
  }

  function handleCloseHistory() {
    setHistoryState({ status: 'idle', data: null, error: '' })
  }

  const products = searchState.data?.products ?? []
  const selectedProduct = detailState.data
  const selectedOption = selectedProduct?.options.find(
    (option) => option.optionId === selectedOptionId
  )
  const selectedTrackedProduct = historyState.data?.trackedProduct
  const scrapeAttempts = historyState.data?.attempts ?? []
  const latestAttempt = scrapeAttempts[0] ?? null
  const successfulAttempts = scrapeAttempts
    .filter((attempt) => attempt.outcome === 'success')
    .slice()
    .reverse()

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
                  ? 'Track this option to include it in your dashboard.'
                  : 'Each option can have its own price and stock level.'}
              </p>
            </div>
            <button
              type="button"
              disabled={!selectedOption || trackingState.status === 'loading'}
              onClick={handleTrackOption}
            >
              {trackingState.status === 'loading' ? 'Tracking…' : 'Track option'}
            </button>
          </div>
          {trackingState.status === 'success' && (
            <p className="message success" role="status">This product option is now being tracked.</p>
          )}
          {trackingState.status === 'error' && (
            <p className="message error" role="alert">{trackingState.error}</p>
          )}
        </section>
      )}

      <section className="tracked-section" aria-labelledby="tracked-products-heading">
        <div className="section-heading">
          <div>
            <h2 id="tracked-products-heading">Tracked products</h2>
            <p>A shared live list visible to every visitor.</p>
          </div>
        </div>

        {trackedProductsState.status === 'loading' && <p className="message loading" role="status">Loading tracked products…</p>}
        {trackedProductsState.status === 'error' && <p className="message error" role="alert">{trackedProductsState.error}</p>}
        {trackedProductsState.status === 'success' && trackedProductsState.products.length === 0 && (
          <div className="empty-state">
            <h3>No products tracked yet</h3>
            <p>Select a product option above to start tracking it.</p>
          </div>
        )}
        {trackedProductsState.status === 'success' && trackedProductsState.products.length > 0 && (
          <ul className="tracked-list">
            {trackedProductsState.products.map((product) => (
              <li key={product.id} className="tracked-card">
                <div>
                  <h3>{product.product_name}</h3>
                  <p>{product.option_name}</p>
                </div>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => handleShowHistory(product.id)}
                >
                  View details
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {historyState.status === 'loading' && (
        <p className="message loading" role="status">Loading scrape history…</p>
      )}
      {historyState.status === 'error' && (
        <p className="message error" role="alert">{historyState.error}</p>
      )}

      {historyState.status === 'success' && (
        <section className="history-section" aria-labelledby="history-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">TRACKED PRODUCT DETAILS</p>
              <h2 id="history-heading">{selectedTrackedProduct.product_name}</h2>
              <p>{selectedTrackedProduct.option_name}</p>
              <p className="product-id">Store product ID: {selectedTrackedProduct.product_id}</p>
            </div>
            <div className="history-actions">
              <a href={selectedTrackedProduct.product_url} target="_blank" rel="noreferrer">
                View in store
              </a>
              <button type="button" className="secondary-button" onClick={handleCloseHistory}>
                Close details
              </button>
            </div>
          </div>

          <div className="latest-status-card">
            <div>
              <h3>Latest scrape status</h3>
              {latestAttempt ? (
                <p>Recorded {formatTimestamp(latestAttempt.scraped_at)}</p>
              ) : (
                <p>No scrape attempt has been recorded yet.</p>
              )}
            </div>
            {latestAttempt ? (
              <div className="latest-status-value">
                <span className={`status-badge is-${latestAttempt.outcome}`}>
                  {outcomeLabel(latestAttempt.outcome)}
                </span>
                {latestAttempt.outcome === 'success' ? (
                  <p>{formatPrice(latestAttempt.price)} · {formatStock(latestAttempt.stock)} in stock</p>
                ) : (
                  <p>{latestAttempt.error_code}: {latestAttempt.error_message}</p>
                )}
              </div>
            ) : (
              <span className="status-badge is-awaiting">Awaiting first scrape</span>
            )}
          </div>

          <div className="history-block">
            <div className="history-block-heading">
              <div>
                <h3>Price and stock history</h3>
                <p>Validated successful observations, oldest first.</p>
              </div>
              <span className="count-label">
                {successfulAttempts.length} observation{successfulAttempts.length === 1 ? '' : 's'}
              </span>
            </div>

            {successfulAttempts.length === 0 ? (
              <div className="empty-state compact-empty-state">
                <h3>No successful price observations yet</h3>
                <p>Failures are retained below in the scrape log.</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <caption className="visually-hidden">Successful price and stock observations</caption>
                  <thead>
                    <tr>
                      <th scope="col">Timestamp</th>
                      <th scope="col">Price</th>
                      <th scope="col">Stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {successfulAttempts.map((attempt) => (
                      <tr key={attempt.id}>
                        <td>{formatTimestamp(attempt.scraped_at)}</td>
                        <td>{formatPrice(attempt.price)}</td>
                        <td>{formatStock(attempt.stock)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="history-block">
            <div className="history-block-heading">
              <div>
                <h3>Scrape log</h3>
                <p>Every attempt is visible, including retries and final failures.</p>
              </div>
              <span className="count-label">
                {scrapeAttempts.length} attempt{scrapeAttempts.length === 1 ? '' : 's'}
              </span>
            </div>

            {scrapeAttempts.length === 0 ? (
              <div className="empty-state compact-empty-state">
                <h3>No scrape log entries yet</h3>
                <p>The first manual or scheduled scrape will appear here.</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <caption className="visually-hidden">Complete scrape log</caption>
                  <thead>
                    <tr>
                      <th scope="col">Timestamp</th>
                      <th scope="col">Attempt</th>
                      <th scope="col">Outcome</th>
                      <th scope="col">Price</th>
                      <th scope="col">Stock</th>
                      <th scope="col">Duration</th>
                      <th scope="col">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scrapeAttempts.map((attempt) => (
                      <tr key={attempt.id}>
                        <td>{formatTimestamp(attempt.scraped_at)}</td>
                        <td>{attempt.attempt_number}</td>
                        <td>
                          <span className={`status-badge is-${attempt.outcome}`}>
                            {outcomeLabel(attempt.outcome)}
                          </span>
                        </td>
                        <td>{formatPrice(attempt.price)}</td>
                        <td>{formatStock(attempt.stock)}</td>
                        <td>{formatDuration(attempt.duration_ms)}</td>
                        <td className="attempt-details">
                          {attempt.error_code ? `${attempt.error_code}: ${attempt.error_message}` : 'Validated quote'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}
    </main>
  )
}

export default App
