const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001').replace(/\/$/, '')

async function request(path, options = {}) {
  let response

  try {
    response = await fetch(`${API_BASE_URL}${path}`, options)
  } catch {
    throw new Error('Could not reach the API. Check that the backend is running.')
  }

  const body = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(body?.error?.message || 'The API could not complete this request.')
  }

  return body
}

export function searchProducts(query, { page = 1 } = {}) {
  return request(`/api/products/search?q=${encodeURIComponent(query)}&page=${encodeURIComponent(page)}`)
}

export function getProduct(productId) {
  return request(`/api/products/${encodeURIComponent(productId)}`)
}

export function createTrackedProduct({ productId, optionId }) {
  return request('/api/tracked-products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productId, optionId }),
  })
}

/** Feature 5: track multiple options in one call */
export function bulkCreateTrackedProducts({ productId, optionIds }) {
  return request('/api/tracked-products/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productId, optionIds }),
  })
}

export function listTrackedProducts() {
  return request('/api/tracked-products')
}

export function getTrackedProduct(trackedProductId) {
  return request(`/api/tracked-products/${encodeURIComponent(trackedProductId)}`)
}

export function getTrackedProductHistory(trackedProductId) {
  return request(`/api/tracked-products/${encodeURIComponent(trackedProductId)}/history`)
}

export function getTrackedProductAlerts(trackedProductId) {
  return request(`/api/tracked-products/${encodeURIComponent(trackedProductId)}/alerts`)
}

export function scrapeTrackedProductNow(trackedProductId) {
  return request(`/api/tracked-products/${encodeURIComponent(trackedProductId)}/scrape`, {
    method: 'POST',
  })
}

/** Feature 4: set custom scrape frequency for a product */
export function setTrackedProductFrequency(trackedProductId, frequencyMinutes) {
  return request(`/api/tracked-products/${encodeURIComponent(trackedProductId)}/frequency`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ frequencyMinutes }),
  })
}

/** Feature 1: alerts API */
export function listAlerts({ unreadOnly = false } = {}) {
  const params = unreadOnly ? '?unread=1' : ''
  return request(`/api/alerts${params}`)
}

export function markAllAlertsRead() {
  return request('/api/alerts/read-all', { method: 'POST' })
}

export function markAlertRead(alertId) {
  return request(`/api/alerts/${encodeURIComponent(alertId)}/read`, { method: 'POST' })
}

export async function downloadTrackedProductHistoryCsv(trackedProductId) {
  let response

  try {
    response = await fetch(
      `${API_BASE_URL}/api/tracked-products/${encodeURIComponent(trackedProductId)}/export`
    )
  } catch {
    throw new Error('Could not reach the API. Check that the backend is running.')
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error?.message || 'The API could not prepare this CSV export.')
  }

  return response.blob()
}

export async function downloadAllTrackedProductsHistoryCsv() {
  let response

  try {
    response = await fetch(`${API_BASE_URL}/api/tracked-products/export`)
  } catch {
    throw new Error('Could not reach the API. Check that the backend is running.')
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error?.message || 'The API could not prepare this CSV export.')
  }

  return response.blob()
}
