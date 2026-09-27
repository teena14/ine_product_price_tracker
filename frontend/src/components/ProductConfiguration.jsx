import { forwardRef, useState } from 'react'
import { bulkCreateTrackedProducts } from '../api'
import { formatProductMeta } from '../utils/formatters'

export const ProductConfiguration = forwardRef(function ProductConfiguration(
  {
    detailState,
    selectedOptionId,
    onSelectOption,
    trackingState,
    onTrackOption,
    onBulkTracked,
  },
  ref
) {
  // Multi-option tracking state (Feature 5)
  const [multiMode, setMultiMode] = useState(false)
  const [multiSelected, setMultiSelected] = useState(new Set())
  const [bulkState, setBulkState] = useState({ status: 'idle', results: [], error: '' })

  if (detailState.status === 'idle') {
    return null
  }

  const selectedProduct = detailState.data
  const selectedOption = selectedProduct?.options?.find((o) => o.optionId === selectedOptionId)
  const hasMultipleOptions = (selectedProduct?.options?.length ?? 0) > 1

  function toggleMultiOption(optionId) {
    setMultiSelected((prev) => {
      const next = new Set(prev)
      if (next.has(optionId)) {
        next.delete(optionId)
      } else {
        next.add(optionId)
      }
      return next
    })
  }

  function handleSelectAll() {
    setMultiSelected(new Set(selectedProduct.options.map((o) => o.optionId)))
  }

  function handleClearAll() {
    setMultiSelected(new Set())
  }

  async function handleBulkTrack() {
    if (multiSelected.size === 0) return
    setBulkState({ status: 'loading', results: [], error: '' })
    try {
      const data = await bulkCreateTrackedProducts({
        productId: selectedProduct.productId,
        optionIds: [...multiSelected],
      })
      const results = data.results ?? []
      const failedResults = results.filter((result) => result.status === 'error')

      if (failedResults.length === 0) {
        onBulkTracked?.(
          results
            .filter((result) => result.status === 'created')
            .map((result) => result.trackedProduct)
        )
        return
      }

      setBulkState({ status: 'success', results, error: '' })
    } catch (err) {
      setBulkState({ status: 'error', results: [], error: err.message || 'Failed to bulk-track options' })
    }
  }

  return (
    <div ref={ref} className="scroll-mt-8">
      {detailState.status === 'loading' && (
        <p className="rounded-[10px] my-5 px-4 py-[13px] bg-brand-info-bg text-brand-info text-sm" role="status">
          Loading product options…
        </p>
      )}

      {detailState.status === 'error' && (
        <div className="rounded-[10px] my-5 px-4 py-[13px] bg-brand-error-bg text-brand-error text-sm" role="alert">
          <strong>Could not load product.</strong> {detailState.error}
        </div>
      )}

      {detailState.status === 'success' && selectedProduct && (
        <section
          className="border border-brand-border rounded-2xl bg-brand-surface shadow-[0_2px_8px_rgb(25_39_52/0.04)] mt-6 p-5 sm:p-7"
          aria-labelledby="selection-heading"
        >
          {/* Product header */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-[22px]">
            <div>
              <p className="text-brand-accent-strong text-xs font-bold tracking-[0.1em] mb-2.5 uppercase">
                Selected Product
              </p>
              <h2 id="selection-heading" className="text-xl font-bold tracking-[-0.02em] mb-1.5 text-brand-heading">
                {selectedProduct.name}
              </h2>
              <p className="text-brand-muted text-sm">{formatProductMeta(selectedProduct)}</p>
            </div>
            <a
              href={selectedProduct.productUrl}
              target="_blank"
              rel="noreferrer"
              className="text-brand-accent-strong text-[0.9rem] font-bold no-underline whitespace-nowrap hover:underline focus-visible:outline-3 focus-visible:outline-brand-focus focus-visible:outline-offset-2"
            >
              View in store <span aria-hidden="true">↗</span>
            </a>
          </div>

          {selectedProduct.description && (
            <p className="border-b border-brand-border text-brand-muted leading-[1.55] mb-6 pb-6 text-sm sm:text-base">
              {selectedProduct.description}
            </p>
          )}

          {/* Mode toggle (only when multiple options exist) */}
          {hasMultipleOptions && (
            <div className="flex items-center gap-2 mb-4">
              <button
                type="button"
                id="single-mode-btn"
                onClick={() => { setMultiMode(false); setBulkState({ status: 'idle', results: [], error: '' }) }}
                className={`rounded-full px-3.5 py-1 text-[0.8rem] font-semibold border transition-colors ${!multiMode ? 'bg-brand-accent text-white border-brand-accent-strong' : 'bg-brand-surface border-brand-border text-brand-muted hover:bg-brand-accent-soft'}`}
              >
                Single option
              </button>
              <button
                type="button"
                id="multi-mode-btn"
                onClick={() => { setMultiMode(true); setBulkState({ status: 'idle', results: [], error: '' }) }}
                className={`rounded-full px-3.5 py-1 text-[0.8rem] font-semibold border transition-colors ${multiMode ? 'bg-brand-accent text-white border-brand-accent-strong' : 'bg-brand-surface border-brand-border text-brand-muted hover:bg-brand-accent-soft'}`}
              >
                Multiple options ✦
              </button>
            </div>
          )}

          {/* Option picker */}
          {(!selectedProduct.options || selectedProduct.options.length === 0) ? (
            <p className="rounded-[10px] my-5 px-4 py-[13px] bg-brand-error-bg text-brand-error text-sm" role="alert">
              This product has no trackable options.
            </p>
          ) : !multiMode ? (
            // ─── Single-option mode ───────────────────────────────────────────
            <fieldset className="border-0 m-0 p-0">
              <legend className="text-brand-heading font-bold mb-3 p-0">
                Select {selectedProduct.optionAxis || 'an option'}
              </legend>
              <div className="flex flex-wrap gap-2.5 list-none m-0 p-0">
                {selectedProduct.options.map((option) => (
                  <label
                    key={`single-${option.optionId}`}
                    className={`inline-flex items-center rounded-[9px] cursor-pointer gap-2 px-3 py-2.5 text-sm transition-colors border ${
                      selectedOptionId === option.optionId
                        ? 'bg-brand-accent-soft border-brand-accent'
                        : 'bg-brand-surface border-brand-border-strong hover:bg-brand-accent-soft hover:border-brand-accent'
                    } focus-within:outline-3 focus-within:outline-brand-focus focus-within:outline-offset-2`}
                  >
                    <input
                      type="radio"
                      name="product-option"
                      value={option.optionId}
                      checked={selectedOptionId === option.optionId}
                      onChange={() => onSelectOption(option.optionId)}
                      className="accent-brand-accent h-4 w-4 m-0 cursor-pointer"
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : (
            // ─── Multi-option mode (Feature 5) ───────────────────────────────
            <fieldset className="border-0 m-0 p-0">
              <legend className="text-brand-heading font-bold mb-2 p-0 flex items-center gap-3">
                <span>Select options to track</span>
                <div className="flex gap-1.5 font-normal">
                  <button type="button" onClick={handleSelectAll} className="text-brand-accent-strong text-[0.78rem] hover:underline">All</button>
                  <span className="text-brand-border">|</span>
                  <button type="button" onClick={handleClearAll} className="text-brand-muted text-[0.78rem] hover:underline">None</button>
                </div>
              </legend>
              <div className="flex flex-wrap gap-2.5 mb-4">
                {selectedProduct.options.map((option) => (
                  <label
                    key={`multi-${option.optionId}`}
                    className={`inline-flex items-center rounded-[9px] cursor-pointer gap-2 px-3 py-2.5 text-sm transition-colors border ${
                      multiSelected.has(option.optionId)
                        ? 'bg-brand-accent-soft border-brand-accent'
                        : 'bg-brand-surface border-brand-border-strong hover:bg-brand-accent-soft hover:border-brand-accent'
                    } focus-within:outline-3 focus-within:outline-brand-focus focus-within:outline-offset-2`}
                  >
                    <input
                      type="checkbox"
                      value={option.optionId}
                      checked={multiSelected.has(option.optionId)}
                      onChange={() => toggleMultiOption(option.optionId)}
                      className="accent-brand-accent h-4 w-4 m-0 cursor-pointer"
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>

              {/* Bulk track action */}
              {bulkState.status !== 'success' && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 bg-brand-subtle rounded-xl p-[18px]" aria-live="polite">
                  <div>
                    <h3 className="text-base font-bold text-brand-heading mb-1">
                      {multiSelected.size > 0
                        ? `Track ${multiSelected.size} option${multiSelected.size === 1 ? '' : 's'}`
                        : 'Select options to track all at once'}
                    </h3>
                    <p className="text-brand-muted m-0 text-sm">Each selected option is tracked as a separate entry.</p>
                  </div>
                  <button
                    type="button"
                    id="bulk-track-btn"
                    disabled={multiSelected.size === 0 || bulkState.status === 'loading'}
                    onClick={handleBulkTrack}
                    className="shrink-0 bg-brand-accent hover:not-disabled:bg-brand-accent-strong border border-brand-accent hover:not-disabled:border-brand-accent-strong rounded-[9px] text-white font-bold px-4 py-[11px] cursor-pointer transition-colors disabled:opacity-55 disabled:cursor-not-allowed focus-visible:outline-3 focus-visible:outline-brand-focus focus-visible:outline-offset-2"
                  >
                    {bulkState.status === 'loading' ? 'Tracking…' : `Track ${multiSelected.size || ''} Options`}
                  </button>
                </div>
              )}

              {/* Bulk track results */}
              {bulkState.status === 'success' && (
                <div className="rounded-xl bg-brand-success-bg border border-brand-success/30 p-4 mt-2">
                  <p className="font-bold text-brand-success mb-2">✓ Bulk tracking started</p>
                  <ul className="list-none m-0 p-0 space-y-1">
                    {bulkState.results.map((r) => {
                      const opt = selectedProduct.options.find((o) => o.optionId === r.optionId)
                      return (
                        <li key={r.optionId} className="text-sm flex items-center gap-2">
                          <span>{r.status === 'created' ? '✓' : r.status === 'duplicate' ? '≡' : '✗'}</span>
                          <span className="text-brand-text">{opt?.label ?? r.optionId}</span>
                          <span className="text-brand-muted text-[0.8rem]">
                            {r.status === 'created' ? 'Now tracking' : r.status === 'duplicate' ? 'Already tracked' : `Error: ${r.error}`}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}

              {bulkState.status === 'error' && (
                <p className="rounded-[10px] my-3 px-4 py-[13px] bg-brand-error-bg text-brand-error text-sm" role="alert">
                  {bulkState.error}
                </p>
              )}
            </fieldset>
          )}

          {/* Single-option track action */}
          {!multiMode && (
            <>
              <div
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 bg-brand-subtle rounded-xl mt-7 p-[18px]"
                aria-live="polite"
              >
                <div>
                  <h3 className="text-base font-bold text-brand-heading mb-1">
                    {selectedOption
                      ? `${selectedProduct.name} — ${selectedOption.label}`
                      : 'Choose an option to continue'}
                  </h3>
                  <p className="text-brand-muted m-0 text-sm">
                    {selectedOption
                      ? 'Track this option to monitor its price and stock.'
                      : 'Each option can have its own price and stock level.'}
                  </p>
                </div>

                <button
                  type="button"
                  disabled={!selectedOption || trackingState.status === 'loading'}
                  onClick={onTrackOption}
                  className="shrink-0 bg-brand-accent hover:not-disabled:bg-brand-accent-strong border border-brand-accent hover:not-disabled:border-brand-accent-strong rounded-[9px] text-white font-bold px-4 py-[11px] cursor-pointer transition-colors disabled:opacity-55 disabled:cursor-not-allowed focus-visible:outline-3 focus-visible:outline-brand-focus focus-visible:outline-offset-2"
                >
                  {trackingState.status === 'loading' ? 'Starting tracking…' : 'Track Product'}
                </button>
              </div>

              {/* Tracking feedback */}
              {trackingState.status === 'error' && (
                <p className="rounded-[10px] my-5 px-4 py-[13px] bg-brand-error-bg text-brand-error text-sm" role="alert">
                  {trackingState.error}
                </p>
              )}
            </>
          )}
        </section>
      )}
    </div>
  )
})
