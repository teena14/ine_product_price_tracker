import { useCallback, useEffect, useRef, useState } from 'react'
import { listAlerts, markAllAlertsRead } from '../api'
import { formatRelativeTime } from '../utils/formatters'

const ALERT_ICONS = {
  price_drop: '📉',
  back_in_stock: '✅',
  out_of_stock: '❌',
  layout_changed: '⚠️',
}

const ALERT_COLORS = {
  price_drop: 'text-brand-success bg-brand-success-bg border-brand-success',
  back_in_stock: 'text-brand-success bg-brand-success-bg border-brand-success',
  out_of_stock: 'text-brand-error bg-brand-error-bg border-brand-error',
  layout_changed: 'text-amber-700 bg-amber-50 border-amber-300',
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

  useEffect(() => {
    loadAlerts()
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
        className="relative flex items-center justify-center w-10 h-10 rounded-full bg-brand-surface border border-brand-border hover:bg-brand-accent-soft hover:border-brand-accent-light transition-colors focus-visible:outline-3 focus-visible:outline-brand-focus"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-heading">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-brand-error text-white text-[0.65rem] font-bold flex items-center justify-center px-1">
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
          className="absolute right-0 top-12 w-[min(380px,calc(100vw-32px))] bg-brand-surface border border-brand-border rounded-2xl shadow-[0_8px_32px_rgb(25_39_52/0.14)] z-50 overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-brand-border">
            <span className="font-bold text-brand-heading text-[0.95rem]">
              Alerts
              {unreadCount > 0 && (
                <span className="ml-2 bg-brand-error text-white rounded-full text-[0.7rem] px-2 py-0.5 font-bold">
                  {unreadCount} new
                </span>
              )}
            </span>
            {unreadCount > 0 && (
              <button
                type="button"
                id="mark-all-read-btn"
                onClick={handleMarkAllRead}
                disabled={markingRead}
                className="text-brand-accent-strong text-[0.8rem] font-semibold hover:underline disabled:opacity-50"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Alert list */}
          <div className="max-h-[380px] overflow-y-auto">
            {alerts.length === 0 ? (
              <div className="px-4 py-8 text-center text-brand-muted text-sm">
                <span className="text-2xl block mb-2">🔔</span>
                No alerts yet. Alerts appear here when prices drop or stock changes.
              </div>
            ) : (
              <ul className="divide-y divide-brand-border list-none m-0 p-0">
                {alerts.map((alert) => (
                  <li
                    key={alert.id}
                    className={`px-4 py-3 transition-colors ${alert.read_at ? 'opacity-60' : 'bg-brand-accent-soft/30'}`}
                  >
                    <div className="flex gap-2.5 items-start">
                      <span className="text-lg mt-0.5 shrink-0">{ALERT_ICONS[alert.alert_type] ?? '🔔'}</span>
                      <div className="flex-1 min-w-0">
                        <span className={`inline-block text-[0.7rem] font-bold uppercase tracking-wide rounded px-1.5 py-0.5 mb-1 border ${ALERT_COLORS[alert.alert_type] ?? 'text-brand-muted bg-brand-subtle border-brand-border'}`}>
                          {alert.alert_type.replace('_', ' ')}
                        </span>
                        <p className="text-brand-text text-[0.82rem] leading-[1.5] m-0">
                          {alert.message}
                        </p>
                        <span className="text-brand-muted text-[0.75rem] mt-1 block">
                          {formatRelativeTime(alert.created_at)}
                        </span>
                      </div>
                      {!alert.read_at && (
                        <span className="w-2 h-2 rounded-full bg-brand-accent shrink-0 mt-1.5" aria-label="Unread" />
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
