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
          className="border border-brand-border rounded-xl bg-brand-surface card-elevation mt-5 p-4 sm:p-5 animate-in fade-in duration-200"
          aria-labelledby="selection-heading"
        >
          {/* Product header */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4 pb-4 border-b border-brand-border">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-brand-lime-soft text-brand-dark text-[0.68rem] font-bold tracking-wider uppercase mb-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-dark" />
                Selected Product
              </div>
              <h2 id="selection-heading" className="text-base sm:text-lg font-bold tracking-tight mb-1 text-brand-heading">
                {selectedProduct.name}
              </h2>
              <p className="text-brand-muted text-xs font-medium">{formatProductMeta(selectedProduct)}</p>
            </div>
            <a
              href={selectedProduct.productUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-brand-heading hover:text-brand-black text-[0.72rem] font-bold bg-brand-surface-subtle hover:bg-brand-subtle border border-brand-border px-3 py-1.5 rounded-lg transition-colors shrink-0 shadow-2xs"
            >
              <span>View in store</span>
              <span aria-hidden="true">→</span>
            </a>
          </div>

          {selectedProduct.description && (
            <p className="border-b border-brand-border text-brand-muted leading-relaxed mb-4 pb-4 text-xs">
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
                className={`rounded-full px-3 py-1 text-xs font-bold border transition-all cursor-pointer ${!multiMode ? 'bg-brand-black text-white border-brand-black shadow-xs' : 'bg-brand-surface border-brand-border text-brand-muted hover:text-brand-heading hover:bg-brand-surface-subtle'}`}
              >
                Single option
              </button>
              <button
                type="button"
                id="multi-mode-btn"
                onClick={() => { setMultiMode(true); setBulkState({ status: 'idle', results: [], error: '' }) }}
                className={`rounded-full px-3 py-1 text-xs font-bold border transition-all cursor-pointer ${multiMode ? 'bg-brand-lime text-brand-black border-brand-lime shadow-xs' : 'bg-brand-surface border-brand-border text-brand-muted hover:text-brand-heading hover:bg-brand-surface-subtle'}`}
              >
                Multiple options
              </button>
            </div>
          )}

          {/* Option picker */}
          {(!selectedProduct.options || selectedProduct.options.length === 0) ? (
            <p className="rounded-xl my-5 px-4 py-3 bg-brand-error-bg text-brand-error text-sm font-medium border border-brand-error/20" role="alert">
              This product has no trackable options.
            </p>
          ) : !multiMode ? (
            // ─── Single-option mode ───────────────────────────────────────────
            <fieldset className="border-0 m-0 p-0">
              <legend className="text-brand-heading font-bold text-xs mb-2.5 p-0">
                Choose {selectedProduct.optionAxis || 'variant option'}:
              </legend>
              <div className="flex flex-wrap gap-2 list-none m-0 p-0">
                {selectedProduct.options.map((option) => (
                  <label
                    key={`single-${option.optionId}`}
                    className={`inline-flex items-center rounded-lg cursor-pointer gap-2 px-3 py-1.5 text-xs transition-all border ${
                      selectedOptionId === option.optionId
                        ? 'bg-brand-lime-soft border-brand-dark/40 font-bold text-brand-black shadow-2xs ring-2 ring-brand-lime'
                        : 'bg-brand-surface border-brand-border hover:bg-brand-surface-subtle hover:border-brand-border-strong text-brand-text font-medium'
                    }`}
                  >
                    <input
                      type="radio"
                      name="product-option"
                      value={option.optionId}
                      checked={selectedOptionId === option.optionId}
                      onChange={() => onSelectOption(option.optionId)}
                      className="accent-brand-black h-3.5 w-3.5 m-0 cursor-pointer"
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : (
            // ─── Multi-option mode (Feature 5) ───────────────────────────────
            <fieldset className="border-0 m-0 p-0">
              <legend className="text-brand-heading font-bold text-xs mb-2.5 p-0 flex items-center justify-between">
                <span>Select variants to track:</span>
                <div className="flex items-center gap-2 font-normal">
                  <button type="button" onClick={handleSelectAll} className="text-brand-dark font-bold text-[0.72rem] hover:underline cursor-pointer">Select All</button>
                  <span className="text-brand-border">|</span>
                  <button type="button" onClick={handleClearAll} className="text-brand-muted text-[0.72rem] hover:underline cursor-pointer">Clear All</button>
                </div>
              </legend>
              <div className="flex flex-wrap gap-2 mb-4">
                {selectedProduct.options.map((option) => (
                  <label
                    key={`multi-${option.optionId}`}
                    className={`inline-flex items-center rounded-lg cursor-pointer gap-2 px-3 py-1.5 text-xs transition-all border ${
                      multiSelected.has(option.optionId)
                        ? 'bg-brand-lime-soft border-brand-dark/40 font-bold text-brand-black shadow-2xs ring-2 ring-brand-lime'
                        : 'bg-brand-surface border-brand-border hover:bg-brand-surface-subtle hover:border-brand-border-strong text-brand-text font-medium'
                    }`}
                  >
                    <input
                      type="checkbox"
                      value={option.optionId}
                      checked={multiSelected.has(option.optionId)}
                      onChange={() => toggleMultiOption(option.optionId)}
                      className="accent-brand-black h-3.5 w-3.5 m-0 cursor-pointer"
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>

              {/* Bulk track action */}
              {bulkState.status !== 'success' && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-brand-surface-subtle border border-brand-border rounded-xl p-3.5 sm:p-4" aria-live="polite">
                  <div>
                    <h3 className="text-xs sm:text-sm font-bold text-brand-heading mb-0.5">
                      {multiSelected.size > 0
                        ? `Ready to track ${multiSelected.size} option${multiSelected.size === 1 ? '' : 's'}`
                        : 'Select options to track all at once'}
                    </h3>
                    <p className="text-brand-muted m-0 text-[0.72rem]">Each selected option is monitored as a separate tracked product.</p>
                  </div>
                  <button
                    type="button"
                    id="bulk-track-btn"
                    disabled={multiSelected.size === 0 || bulkState.status === 'loading'}
                    onClick={handleBulkTrack}
                    className="shrink-0 bg-brand-lime hover:bg-brand-lime-hover border border-brand-lime text-brand-black font-extrabold px-4 py-2 rounded-lg cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-xs active:scale-98 text-xs"
                  >
                    {bulkState.status === 'loading' ? 'Tracking…' : `Track ${multiSelected.size || ''} Options`}
                  </button>
                </div>
              )}

              {/* Bulk track results */}
              {bulkState.status === 'success' && (
                <div className="rounded-xl bg-brand-success-bg border border-brand-success/30 p-3 mt-2.5">
                  <p className="font-bold text-brand-success mb-1.5 text-xs">✓ Bulk tracking started successfully</p>
                  <ul className="list-none m-0 p-0 space-y-1">
                    {bulkState.results.map((r) => {
                      const opt = selectedProduct.options.find((o) => o.optionId === r.optionId)
                      return (
                        <li key={r.optionId} className="text-[0.72rem] flex items-center gap-1.5">
                          <span className="font-bold">{r.status === 'created' ? '✓' : r.status === 'duplicate' ? '≡' : '✗'}</span>
                          <span className="text-brand-heading font-semibold">{opt?.label ?? r.optionId}</span>
                          <span className="text-brand-muted">
                            {r.status === 'created' ? 'Now tracking' : r.status === 'duplicate' ? 'Already tracked' : `Error: ${r.error}`}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}

              {bulkState.status === 'error' && (
                <p className="rounded-xl my-2.5 px-3 py-2 bg-brand-error-bg text-brand-error text-xs font-medium border border-brand-error/20" role="alert">
                  {bulkState.error}
                </p>
              )}
            </fieldset>
          )}

          {/* Single-option track action */}
          {!multiMode && (
            <>
              <div
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-brand-surface-subtle border border-brand-border rounded-xl mt-4 p-3.5 sm:p-4"
                aria-live="polite"
              >
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-brand-heading mb-0.5">
                    {selectedOption
                      ? `${selectedProduct.name} — ${selectedOption.label}`
                      : 'Choose an option to continue'}
                  </h3>
                  <p className="text-brand-muted m-0 text-[0.72rem]">
                    {selectedOption
                      ? 'Track this option to monitor its price shifts and stock level.'
                      : 'Each option can have its own price and stock level.'}
                  </p>
                </div>

                <button
                  type="button"
                  disabled={!selectedOption || trackingState.status === 'loading'}
                  onClick={onTrackOption}
                  className="shrink-0 bg-brand-lime hover:bg-brand-lime-hover border border-brand-lime text-brand-black font-extrabold px-4 py-2 rounded-lg cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-xs active:scale-98 text-xs"
                >
                  {trackingState.status === 'loading' ? 'Starting tracking…' : 'Track Product'}
                </button>
              </div>

              {/* Tracking feedback */}
              {trackingState.status === 'error' && (
                <p className="rounded-xl my-3 px-3 py-2 bg-brand-error-bg text-brand-error text-xs font-medium border border-brand-error/20" role="alert">
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
