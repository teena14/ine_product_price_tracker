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
      className="flex flex-wrap items-center justify-center gap-3 mt-[22px]"
      aria-label="Tracked products pages"
    >
      <button
        type="button"
        className="bg-brand-surface border border-brand-border-strong text-brand-accent-strong font-semibold rounded-[9px] px-4 py-[11px] cursor-pointer hover:not-disabled:bg-brand-accent-soft hover:not-disabled:border-brand-accent transition-colors disabled:opacity-55 disabled:cursor-not-allowed text-sm focus-visible:outline-3 focus-visible:outline-brand-focus focus-visible:outline-offset-2"
        disabled={currentPage <= 1}
        onClick={handlePrev}
      >
        ← Previous
      </button>
      <span className="text-brand-muted text-[0.9rem] font-bold">
        Page {currentPage} of {totalPages}
      </span>
      <button
        type="button"
        className="bg-brand-surface border border-brand-border-strong text-brand-accent-strong font-semibold rounded-[9px] px-4 py-[11px] cursor-pointer hover:not-disabled:bg-brand-accent-soft hover:not-disabled:border-brand-accent transition-colors disabled:opacity-55 disabled:cursor-not-allowed text-sm focus-visible:outline-3 focus-visible:outline-brand-focus focus-visible:outline-offset-2"
        disabled={currentPage >= totalPages}
        onClick={handleNext}
      >
        Next →
      </button>
    </nav>
  )
}
