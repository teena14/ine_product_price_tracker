import { Link } from 'react-router-dom'
import { formatPrice, formatRelativeTime } from '../utils/formatters'

export function TrackedCard({ product }) {
  const lastChecked = product.last_scraped_at
  const currentPrice = product.last_price
  const isAvailable = product.last_stock != null ? product.last_stock > 0 : null

  return (
    <Link
      to={`/track/${product.id}`}
      className="bg-brand-surface border border-brand-border rounded-xl text-brand-text block px-5 py-4 no-underline transition-colors hover:bg-brand-accent-soft hover:border-brand-accent-light focus-visible:outline-3 focus-visible:outline-brand-focus focus-visible:outline-offset-2"
      aria-label={`View tracking for ${product.product_name} — ${product.option_name}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5 sm:gap-4">
        <div className="flex flex-col gap-[3px] min-w-0">
          <span className="text-brand-heading font-bold text-[0.95rem] truncate">{product.product_name}</span>
          <span className="text-brand-muted text-[0.85rem]">{product.option_name}</span>
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className="flex flex-wrap items-center gap-2 justify-end">
            {currentPrice != null && (
              <span className="font-bold text-[0.95rem] text-brand-heading">{formatPrice(currentPrice)}</span>
            )}

            {isAvailable !== null && (
              <span
                className={`rounded-full inline-block text-[0.75rem] font-bold px-[9px] py-1 text-center whitespace-nowrap ${isAvailable ? 'bg-brand-success-bg text-brand-success' : 'bg-brand-error-bg text-brand-error'
                  }`}
              >
                {isAvailable ? 'In stock' : 'Out of stock'}
              </span>
            )}

            <span
              className={`rounded-full inline-block text-[0.75rem] font-bold px-[9px] py-1 text-center whitespace-nowrap ${product.active ? 'bg-brand-success-bg text-brand-success' : 'bg-brand-subtle text-brand-muted'
                }`}
            >
              {product.active ? 'Active' : 'Paused'}
            </span>
          </div>

        </div>
      </div>

      {lastChecked && (
        <div className="border-t border-brand-border pt-2.5 mt-2.5 flex items-center justify-between">
          <span className="text-brand-muted text-[0.8rem]">Checked {formatRelativeTime(lastChecked)}</span>
          <span className="text-brand-accent-strong text-[0.85rem] font-semibold">View Tracking →</span>
        </div>
      )}
    </Link>
  )
}
