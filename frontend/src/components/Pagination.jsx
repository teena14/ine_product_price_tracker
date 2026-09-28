export function Pagination({
  currentPage,
  totalPages,
  onPrev,
  onNext,
  onPageChange,
}) {
  if (totalPages <= 1) return null

  const handlePrev = onPrev || (() => onPageChange?.(currentPage - 1))
  const handleNext = onNext || (() => onPageChange?.(currentPage + 1))

  return (
    <nav
      className="flex flex-wrap items-center justify-center gap-2 mt-5"
      aria-label="Tracked products pages"
    >
      <button
        type="button"
        className="bg-brand-surface border border-brand-border text-brand-heading font-bold rounded-lg px-3 py-1.5 cursor-pointer hover:bg-brand-surface-subtle hover:border-brand-border-strong transition-all disabled:opacity-40 disabled:cursor-not-allowed text-xs shadow-2xs"
        disabled={currentPage <= 1}
        onClick={handlePrev}
      >
        ← Previous
      </button>
      <span className="text-brand-muted text-[0.72rem] font-semibold px-2.5 py-1 bg-brand-surface-subtle border border-brand-border rounded-md">
        Page {currentPage} of {totalPages}
      </span>
      <button
        type="button"
        className="bg-brand-surface border border-brand-border text-brand-heading font-bold rounded-lg px-3 py-1.5 cursor-pointer hover:bg-brand-surface-subtle hover:border-brand-border-strong transition-all disabled:opacity-40 disabled:cursor-not-allowed text-xs shadow-2xs"
        disabled={currentPage >= totalPages}
        onClick={handleNext}
      >
        Next →
      </button>
    </nav>
  )
}

