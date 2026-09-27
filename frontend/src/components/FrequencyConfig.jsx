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
    <div className="bg-brand-surface border border-brand-border rounded-xl p-5 mt-4">
      <fieldset className="border-0 m-0 p-0">
        <legend className="text-base font-bold text-brand-heading mb-1 p-0">Tracking schedule</legend>
        <p className="text-brand-muted text-sm mb-4 mt-0">
          Choose the default site schedule or a custom interval for this product.
        </p>

        <label className="flex items-start gap-3 rounded-lg border border-brand-border p-3 cursor-pointer mb-2 hover:bg-brand-accent-soft focus-within:outline-3 focus-within:outline-brand-focus focus-within:outline-offset-2">
          <input
            type="radio"
            name="schedule-mode"
            value="global"
            checked={mode === 'global'}
            onChange={() => selectMode('global')}
            className="accent-brand-accent h-4 w-4 mt-0.5 shrink-0"
          />
          <span>
            <span className="block text-sm font-semibold text-brand-heading">Global schedule</span>
            <span className="block text-sm text-brand-muted">Use the site-wide scrape interval.</span>
          </span>
        </label>

        <label className="flex items-start gap-3 rounded-lg border border-brand-border p-3 cursor-pointer hover:bg-brand-accent-soft focus-within:outline-3 focus-within:outline-brand-focus focus-within:outline-offset-2">
          <input
            type="radio"
            name="schedule-mode"
            value="custom"
            checked={mode === 'custom'}
            onChange={() => selectMode('custom')}
            className="accent-brand-accent h-4 w-4 mt-0.5 shrink-0"
          />
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold text-brand-heading">Custom schedule</span>
            <span className="flex flex-wrap items-center gap-2 mt-1.5 text-sm text-brand-muted">
              Scrape every
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
                className="w-24 rounded-lg border border-brand-border bg-brand-input px-3 py-1.5 text-sm text-brand-text focus:outline-none focus:border-brand-accent"
              />
              minutes.
            </span>
          </span>
        </label>
      </fieldset>

      <div className="flex items-center gap-2 mt-4">
        <button
          type="button"
          disabled={status === 'saving' || (mode === 'custom' && !hasValidCustomMinutes)}
          onClick={handleSave}
          className="bg-brand-accent text-white font-semibold rounded-lg px-4 py-2 text-sm hover:not-disabled:bg-brand-accent-strong transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-3 focus-visible:outline-brand-focus"
        >
          {status === 'saving' ? 'Saving…' : 'Save schedule'}
        </button>
        {status === 'error' && <span className="text-brand-error text-sm">{error}</span>}
      </div>

      {status === 'success' && (
        <div
          className="fixed right-5 bottom-5 z-50 rounded-lg bg-brand-success px-4 py-3 text-sm font-semibold text-white shadow-lg"
          role="status"
          aria-live="polite"
        >
          Schedule saved
        </div>
      )}
    </div>
  )
}
