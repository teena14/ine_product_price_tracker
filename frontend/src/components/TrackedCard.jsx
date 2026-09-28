import { Link } from 'react-router-dom'
import { formatPrice, formatRelativeTime } from '../utils/formatters'

export function TrackedCard({ product }) {
  const lastChecked = product.last_scraped_at
  const currentPrice = product.last_price
  const isAvailable = product.last_stock != null ? product.last_stock > 0 : null
  const isStarting = !lastChecked

  return (
    <Link
      to={`/track/${product.id}`}
      className="bg-brand-surface border border-brand-border rounded-xl text-brand-text block p-3.5 sm:p-4 no-underline transition-all card-elevation-hover group relative overflow-hidden"
      aria-label={`View tracking for ${product.product_name} — ${product.option_name}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4">
        {/* Left: Product & variant details */}
        <div className="flex flex-col gap-0.5 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-brand-heading font-bold text-sm sm:text-[0.95rem] group-hover:text-brand-black transition-colors truncate">
              {product.product_name}
            </span>
          </div>
          <span className="text-brand-muted text-xs font-medium">
            {product.option_name}
          </span>
        </div>

        {/* Right: Status Tags on LEFT of Price */}
        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
          <div className="flex flex-wrap items-center gap-1.5">
            {isAvailable !== null && (
              <span
                className={`rounded-full inline-flex items-center text-[0.68rem] font-bold px-2 py-0.5 whitespace-nowrap border ${
                  isAvailable
                    ? 'bg-brand-lime-soft text-brand-dark border-brand-lime/40'
                    : 'bg-brand-error-bg text-brand-error border-brand-error/20'
                }`}
              >
                {isAvailable ? 'In stock' : 'Out of stock'}
              </span>
            )}

            <span
              className={`rounded-full inline-flex items-center gap-1 text-[0.68rem] font-bold px-2 py-0.5 whitespace-nowrap border ${
                product.active
                  ? 'bg-brand-surface-subtle text-brand-dark border-brand-border'
                  : 'bg-brand-subtle text-brand-muted border-transparent'
              }`}
            >
              {product.active && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />}
              {product.active ? 'Active' : 'Paused'}
            </span>
          </div>

          <span className={currentPrice != null
            ? 'font-bold text-sm sm:text-base text-brand-heading tracking-tight whitespace-nowrap'
            : 'text-brand-muted text-xs font-medium whitespace-nowrap'}
          >
            {currentPrice != null ? formatPrice(currentPrice) : 'No price recorded'}
          </span>
        </div>
      </div>

      {/* Footer bar */}
      <div className="border-t border-brand-border pt-2.5 mt-3 flex items-center justify-between">
        <span className="text-brand-muted text-[0.72rem] font-medium flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 text-brand-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          {lastChecked ? `Checked ${formatRelativeTime(lastChecked)}` : 'Awaiting first scrape'}
        </span>
        <span className="bg-brand-surface-subtle group-hover:bg-brand-lime text-brand-heading group-hover:text-brand-black rounded-lg text-[0.72rem] font-bold px-2.5 py-1 transition-all border border-brand-border group-hover:border-brand-lime shadow-2xs flex items-center gap-1">
          <span>{isStarting ? 'Starting tracking…' : 'View Tracking'}</span>
          <span aria-hidden="true" className="group-hover:translate-x-0.5 transition-transform">→</span>
        </span>
      </div>
    </Link>
  )
}

