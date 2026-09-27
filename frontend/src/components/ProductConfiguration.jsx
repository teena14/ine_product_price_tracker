import { forwardRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatProductMeta } from '../utils/formatters'

export const ProductConfiguration = forwardRef(function ProductConfiguration(
  {
    detailState,
    selectedOptionId,
    onSelectOption,
    trackingState,
    onTrackOption,
  },
  ref
) {
  const navigate = useNavigate()

  if (detailState.status === 'idle') {
    return null
  }

  const selectedProduct = detailState.data
  const selectedOption = selectedProduct?.options?.find((o) => o.optionId === selectedOptionId)

  return (
    <div ref={ref}>
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

          {/* Option picker */}
          {(!selectedProduct.options || selectedProduct.options.length === 0) ? (
            <p className="rounded-[10px] my-5 px-4 py-[13px] bg-brand-error-bg text-brand-error text-sm" role="alert">
              This product has no trackable options.
            </p>
          ) : (
            <fieldset className="border-0 m-0 p-0">
              <legend className="text-brand-heading font-bold mb-3 p-0">
                Select {selectedProduct.optionAxis || 'an option'}
              </legend>
              <div className="flex flex-wrap gap-2.5 list-none m-0 p-0">
                {selectedProduct.options.map((option) => (
                  <label
                    key={option.optionId}
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
          )}

          {/* Track action */}
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

            {trackingState.status !== 'success' && (
              <button
                type="button"
                disabled={!selectedOption || trackingState.status === 'loading'}
                onClick={onTrackOption}
                className="shrink-0 bg-brand-accent hover:not-disabled:bg-brand-accent-strong border border-brand-accent hover:not-disabled:border-brand-accent-strong rounded-[9px] text-white font-bold px-4 py-[11px] cursor-pointer transition-colors disabled:opacity-55 disabled:cursor-not-allowed focus-visible:outline-3 focus-visible:outline-brand-focus focus-visible:outline-offset-2"
              >
                {trackingState.status === 'loading' ? 'Starting tracking…' : 'Track Product'}
              </button>
            )}
          </div>

          {/* Tracking feedback */}
          {trackingState.status === 'success' && (
            <div
              className="flex items-center gap-4 bg-brand-success-bg text-brand-success rounded-xl mt-4 px-[18px] py-4"
              role="status"
            >
              <span className="text-2xl shrink-0" aria-hidden="true">✓</span>
              <div className="flex-1">
                <strong className="block mb-0.5 font-bold">Tracking started</strong>
                <p className="text-brand-success m-0 text-[0.9rem]">This product option is now being tracked.</p>
              </div>
              <button
                type="button"
                className="shrink-0 bg-brand-surface border border-brand-border-strong text-brand-accent-strong font-semibold rounded-[9px] px-4 py-[11px] cursor-pointer hover:not-disabled:bg-brand-accent-soft hover:not-disabled:border-brand-accent transition-colors disabled:opacity-55 disabled:cursor-not-allowed focus-visible:outline-3 focus-visible:outline-brand-focus focus-visible:outline-offset-2"
                onClick={() => navigate(`/track/${trackingState.trackedId}`)}
              >
                View Tracking →
              </button>
            </div>
          )}
          {trackingState.status === 'error' && (
            <p className="rounded-[10px] my-5 px-4 py-[13px] bg-brand-error-bg text-brand-error text-sm" role="alert">
              {trackingState.error}
            </p>
          )}
        </section>
      )}
    </div>
  )
})
