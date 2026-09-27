export function formatProductMeta(product) {
  return [product.brand, product.category, product.sku].filter(Boolean).join(' · ')
}

export function formatTimestamp(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown time'
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export function formatRelativeTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown'
  const diffMs = Date.now() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}

export function formatPrice(value) {
  const price = Number(value)
  if (!Number.isFinite(price)) return '—'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(price)
}

export function formatStock(value) {
  return Number.isSafeInteger(value) ? String(value) : '—'
}

export function formatDuration(value) {
  return Number.isSafeInteger(value) ? `${value.toLocaleString()} ms` : '—'
}

export function outcomeLabel(outcome) {
  return outcome === 'success' ? 'Success' : outcome === 'retried' ? 'Retried' : 'Failed'
}
