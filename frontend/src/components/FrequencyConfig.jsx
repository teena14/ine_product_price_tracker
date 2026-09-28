import { useState } from 'react'
import { setTrackedProductFrequency } from '../api'

/**
 * A product can either follow the site's global schedule or use one explicit
 * interval. Keeping the choice to these two modes prevents conflicting presets.
 */
export function FrequencyConfig({ trackedProduct, onUpdated }) {
  const currentFrequency = trackedProduct.scrape_frequency_minutes ?? null
  const [mode, setMode] = useState(currentFrequency == null ? 'global' : 'custom')
  const [customMinutes, setCustomMinutes] = useState(
    currentFrequency == null ? '' : String(currentFrequency)
  )
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')

  const parsedMinutes = Number(customMinutes)
  const hasValidCustomMinutes =
    Number.isSafeInteger(parsedMinutes) && parsedMinutes >= 5
  const nextFrequency = mode === 'global' ? null : parsedMinutes

  function selectMode(nextMode) {
    setMode(nextMode)
    setStatus('idle')
    setError('')
  }

  async function handleSave() {
    if (mode === 'custom' && !hasValidCustomMinutes) {
      setStatus('error')
      setError('Enter a whole number of at least 5 minutes.')
      return
    }

    setStatus('saving')
    setError('')

    try {
      const updated = await setTrackedProductFrequency(trackedProduct.id, nextFrequency)
      setStatus('success')
      onUpdated?.(updated)
      setTimeout(() => setStatus('idle'), 2500)
    } catch (saveError) {
      setStatus('error')
      setError(saveError.message || 'Failed to update the schedule')
    }
  }

  return (
    <div className="bg-brand-surface-subtle border border-brand-border rounded-xl p-3.5 sm:p-4 mt-3">
      <fieldset className="border-0 m-0 p-0">
        <legend className="text-xs sm:text-sm font-bold text-brand-heading mb-0.5 p-0">Tracking Schedule</legend>
        <p className="text-brand-muted text-[0.72rem] mb-3 mt-0">
          Choose the default global site schedule or configure a custom scraping interval for this product.
        </p>

        <label className={`flex items-start gap-2.5 rounded-lg border p-2.5 cursor-pointer mb-2 transition-all ${
          mode === 'global'
            ? 'bg-brand-lime-soft border-brand-dark/40 ring-2 ring-brand-lime shadow-2xs'
            : 'bg-brand-surface border-brand-border hover:bg-brand-surface-subtle'
        }`}>
          <input
            type="radio"
            name="schedule-mode"
            value="global"
            checked={mode === 'global'}
            onChange={() => selectMode('global')}
            className="accent-brand-black h-3.5 w-3.5 mt-0.5 shrink-0 cursor-pointer"
          />
          <span>
            <span className="block text-xs font-bold text-brand-heading">Global schedule</span>
            <span className="block text-[0.7rem] text-brand-muted mt-0.5">Use the default site-wide scrape cycle.</span>
          </span>
        </label>

        <label className={`flex items-start gap-2.5 rounded-lg border p-2.5 cursor-pointer transition-all ${
          mode === 'custom'
            ? 'bg-brand-lime-soft border-brand-dark/40 ring-2 ring-brand-lime shadow-2xs'
            : 'bg-brand-surface border-brand-border hover:bg-brand-surface-subtle'
        }`}>
          <input
            type="radio"
            name="schedule-mode"
            value="custom"
            checked={mode === 'custom'}
            onChange={() => selectMode('custom')}
            className="accent-brand-black h-3.5 w-3.5 mt-0.5 shrink-0 cursor-pointer"
          />
          <span className="flex-1 min-w-0">
            <span className="block text-xs font-bold text-brand-heading">Custom interval schedule</span>
            <span className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-brand-text font-medium">
              <span>Scrape every</span>
              <input
                type="number"
                min="5"
                step="1"
                inputMode="numeric"
                value={customMinutes}
                onChange={(event) => {
                  setCustomMinutes(event.target.value)
                  selectMode('custom')
                }}
                aria-label="Custom scrape interval in minutes"
                placeholder="e.g. 30"
                className="w-16 rounded-md border border-brand-border bg-brand-input px-2 py-1 text-xs font-bold text-brand-heading focus:outline-none focus:ring-2 focus:ring-brand-focus"
              />
              <span>minutes (minimum 5).</span>
            </span>
          </span>
        </label>
      </fieldset>

      <div className="flex items-center gap-2.5 mt-3.5">
        <button
          type="button"
          disabled={status === 'saving' || (mode === 'custom' && !hasValidCustomMinutes)}
          onClick={handleSave}
          className="bg-brand-lime hover:bg-brand-lime-hover border border-brand-lime text-brand-black font-extrabold rounded-lg px-3.5 py-1.5 text-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-xs active:scale-95 cursor-pointer"
        >
          {status === 'saving' ? 'Saving…' : 'Save schedule'}
        </button>
        {status === 'error' && <span className="text-brand-error text-xs font-semibold">{error}</span>}
      </div>

      {status === 'success' && (
        <div
          className="fixed right-6 bottom-6 z-50 rounded-2xl bg-brand-dark text-brand-lime border border-brand-dark-border px-5 py-3 text-xs font-extrabold shadow-2xl flex items-center gap-2"
          role="status"
          aria-live="polite"
        >
          <span>✓</span>
          <span>Schedule updated successfully</span>
        </div>
      )}
    </div>
  )
}
