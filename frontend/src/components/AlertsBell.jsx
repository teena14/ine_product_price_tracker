import { useCallback, useEffect, useRef, useState } from 'react'
import { listAlerts, markAllAlertsRead } from '../api'
import { formatRelativeTime } from '../utils/formatters'

const ALERT_ICONS = {
  price_drop: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="22 17 13.5 8.5 8.5 13.5 2 7" />
      <polyline points="16 17 22 17 22 11" />
    </svg>
  ),
  back_in_stock: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16.5 9.4 7.55 4.24" />
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <path d="M3.29 7 12 12l8.71-5" />
      <line x1="12" y1="22" x2="12" y2="12" />
    </svg>
  ),
  out_of_stock: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  layout_changed: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </svg>
  ),
}

const ALERT_COLORS = {
  price_drop: 'text-brand-dark bg-brand-lime-soft border-brand-lime/60 font-semibold',
  back_in_stock: 'text-brand-success bg-brand-success-bg border-brand-success/30 font-semibold',
  out_of_stock: 'text-brand-error bg-brand-error-bg border-brand-error/30 font-semibold',
  layout_changed: 'text-amber-800 bg-amber-50 border-amber-300 font-semibold',
}

const REFRESH_MS = 60_000

export function AlertsBell() {
  const [alerts, setAlerts] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [open, setOpen] = useState(false)
  const [markingRead, setMarkingRead] = useState(false)
  const panelRef = useRef(null)
  const btnRef = useRef(null)

  const loadAlerts = useCallback(async () => {
    try {
      const data = await listAlerts()
      setAlerts(data.alerts ?? [])
      setUnreadCount(data.unreadCount ?? 0)
    } catch {
      // fail silently — alerts are non-critical
    }
  }, [])

  // oxlint-disable-next-line react/set-state-in-effect -- intentional async polling pattern
  useEffect(() => {
    loadAlerts() // oxlint-disable-line react/set-state-in-effect
    const id = window.setInterval(loadAlerts, REFRESH_MS)
    return () => window.clearInterval(id)
  }, [loadAlerts])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target) &&
        btnRef.current &&
        !btnRef.current.contains(e.target)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  async function handleMarkAllRead() {
    setMarkingRead(true)
    setUnreadCount(0)
    setAlerts((prev) => prev.map((alert) => ({ ...alert, read_at: alert.read_at ?? new Date().toISOString() })))

    try {
      await markAllAlertsRead()
    } catch {
      void loadAlerts()
    } finally {
      setMarkingRead(false)
    }
  }

  function handleBellClick() {
    const willOpen = !open
    setOpen(willOpen)

    if (willOpen && unreadCount > 0 && !markingRead) {
      void handleMarkAllRead()
    }
  }

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        id="alerts-bell-btn"
        aria-label={`Alerts${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        aria-expanded={open}
        aria-controls="alerts-panel"
        onClick={handleBellClick}
        className="relative flex items-center justify-center w-8.5 h-8.5 rounded-full bg-brand-surface border border-brand-border text-brand-heading hover:bg-brand-surface-subtle hover:border-brand-border-strong transition-all focus-visible:outline-3 focus-visible:outline-brand-focus cursor-pointer shadow-xs active:scale-95"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[17px] h-[17px] rounded-full bg-brand-lime text-brand-black text-[0.62rem] font-extrabold flex items-center justify-center px-1 shadow-xs border-2 border-brand-surface">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          id="alerts-panel"
          role="dialog"
          aria-label="Alerts panel"
          className="absolute right-0 top-11 w-[min(360px,calc(100vw-32px))] bg-brand-surface border border-brand-border rounded-xl shadow-xl z-50 overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-brand-border bg-brand-surface-subtle">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-brand-heading text-xs">
                Alerts &amp; Updates
              </span>
              {unreadCount > 0 && (
                <span className="bg-brand-lime text-brand-black rounded-full text-[0.65rem] px-1.5 py-0.2 font-bold">
                  {unreadCount} new
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                id="mark-all-read-btn"
                onClick={handleMarkAllRead}
                disabled={markingRead}
                className="text-brand-heading text-[0.72rem] font-semibold hover:underline disabled:opacity-50 cursor-pointer"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Alert list */}
          <div className="max-h-[380px] overflow-y-auto">
            {alerts.length === 0 ? (
              <div className="px-5 py-9 text-center text-brand-muted text-sm">
                <div className="w-10 h-10 rounded-full bg-brand-subtle flex items-center justify-center mx-auto mb-2 text-brand-muted">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                </div>
                <p className="font-semibold text-brand-heading mb-1">No alerts yet</p>
                <p className="text-xs text-brand-muted m-0">Alerts appear here when prices drop or inventory changes.</p>
              </div>
            ) : (
              <ul className="divide-y divide-brand-border list-none m-0 p-0">
                {alerts.map((alert) => (
                  <li
                    key={alert.id}
                    className={`px-4 py-3 transition-colors ${alert.read_at ? 'opacity-65' : 'bg-brand-lime-soft/25'}`}
                  >
                    <div className="flex gap-3 items-start">
                      <span className="mt-1 shrink-0 text-brand-heading">
                        {ALERT_ICONS[alert.alert_type] ?? (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                          </svg>
                        )}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`inline-block text-[0.68rem] tracking-wide rounded-md px-1.5 py-0.5 border ${ALERT_COLORS[alert.alert_type] ?? 'text-brand-muted bg-brand-subtle border-brand-border'}`}>
                            {alert.alert_type.replace('_', ' ')}
                          </span>
                          <span className="text-brand-muted text-[0.72rem]">
                            {formatRelativeTime(alert.created_at)}
                          </span>
                        </div>
                        <p className="text-brand-text text-[0.82rem] leading-[1.45] m-0 font-medium">
                          {alert.message}
                        </p>
                      </div>
                      {!alert.read_at && (
                        <span className="w-2 h-2 rounded-full bg-brand-lime shrink-0 mt-2 shadow-xs" aria-label="Unread" />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
