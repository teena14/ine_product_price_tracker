const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001').replace(/\/$/, '')

async function request(path) {
  let response

  try {
    response = await fetch(`${API_BASE_URL}${path}`, { credentials: 'include' })
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
