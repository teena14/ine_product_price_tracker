export const FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
]

export const SORT_OPTIONS = [
  { value: 'recently_added', label: 'Recently Added' },
  { value: 'name_asc', label: 'Name A–Z' },
]

export function TrackedProductFilters({
  query,
  onQueryChange,
  filter,
  onFilterChange,
  sort,
  onSortChange,
}) {
  return (
    <div className="flex flex-col sm:flex-row flex-wrap gap-2.5 items-stretch sm:items-center mb-3.5">
      <input
        type="search"
        className="flex-1 min-w-[180px] w-full bg-brand-input border border-brand-border-strong rounded-[9px] text-brand-text px-[13px] py-[11px] text-sm focus:outline-3 focus:outline-brand-focus focus:outline-offset-2 appearance-none"
        placeholder="Search tracked products…"
        value={query}
        onChange={onQueryChange}
        aria-label="Search tracked products"
      />

      <div className="flex gap-1.5" role="group" aria-label="Filter by status">
        {FILTER_OPTIONS.map((f) => (
          <button
            key={f.value}
            type="button"
            className={`rounded-full text-[0.85rem] font-semibold px-3.5 py-[7px] cursor-pointer transition-colors border ${
              filter === f.value
                ? 'bg-brand-accent-soft border-brand-accent text-brand-accent-strong'
                : 'bg-brand-surface border-brand-border-strong text-brand-muted hover:bg-brand-accent-soft hover:border-brand-accent hover:text-brand-accent-strong'
            } focus-visible:outline-3 focus-visible:outline-brand-focus focus-visible:outline-offset-2`}
            onClick={() => onFilterChange(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <label htmlFor="tracked-sort" className="shrink-0">
        <span className="sr-only">Sort by</span>
        <select
          id="tracked-sort"
          value={sort}
          onChange={onSortChange}
          className="sort-select bg-brand-surface border border-brand-border-strong rounded-[9px] text-brand-text cursor-pointer text-sm py-2 pl-3 pr-8 focus:outline-3 focus:outline-brand-focus focus:outline-offset-2"
        >
          {SORT_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
