import { FILTER_OPTIONS, SORT_OPTIONS } from '../constants/trackedProductOptions'


export function TrackedProductFilters({
  query,
  onQueryChange,
  filter,
  onFilterChange,
  sort,
  onSortChange,
}) {
  return (
    <div className="flex flex-col md:flex-row flex-wrap gap-3 items-stretch md:items-center justify-between mb-3.5">
      {/* Search within tracked items */}
      <div className="relative flex-1 min-w-[240px]">
        <svg
          className="left-3.5 pointer-events-none absolute h-4 w-4 text-brand-muted top-1/2 -translate-y-1/2"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="6" />
          <path d="m16 16 4 4" />
        </svg>
        <input
          type="search"
          className="w-full bg-brand-input border border-brand-border rounded-xl text-brand-text pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-brand-heading focus:ring-2 focus:ring-brand-focus appearance-none shadow-2xs transition-all"
          placeholder="Filter tracked products by name or variant…"
          value={query}
          onChange={onQueryChange}
          aria-label="Search tracked products"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        {/* Status filters */}
        <div className="flex gap-1.5 p-1 bg-brand-surface-subtle border border-brand-border rounded-xl shadow-2xs" role="group" aria-label="Filter by status">
          {FILTER_OPTIONS.map((f) => {
            const isSelected = filter === f.value
            return (
              <button
                key={f.value}
                type="button"
                className={`rounded-lg text-xs font-bold px-3.5 py-1.5 cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-brand-lime text-brand-black shadow-xs'
                    : 'bg-transparent text-brand-muted hover:text-brand-heading hover:bg-brand-surface'
                }`}
                onClick={() => onFilterChange(f.value)}
              >
                {f.label}
              </button>
            )
          })}
        </div>

        {/* Sort Select */}
        <label htmlFor="tracked-sort" className="shrink-0">
          <span className="sr-only">Sort by</span>
          <select
            id="tracked-sort"
            value={sort}
            onChange={onSortChange}
            className="sort-select bg-brand-surface border border-brand-border rounded-xl text-brand-heading font-semibold cursor-pointer text-xs py-2 pl-3.5 pr-8 focus:outline-none focus:border-brand-heading shadow-2xs"
          >
            {SORT_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  )
}

