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

export function searchProducts(query) {
  return request(`/api/products/search?q=${encodeURIComponent(query)}`)
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

export function listTrackedProducts() {
  return request('/api/tracked-products')
}

export function getTrackedProductHistory(trackedProductId) {
  return request(`/api/tracked-products/${encodeURIComponent(trackedProductId)}/history`)
}
