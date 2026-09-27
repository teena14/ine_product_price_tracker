import { useCallback, useEffect, useState } from 'react'
import { listTrackedProducts } from '../api/products'

const DASHBOARD_REFRESH_INTERVAL_MS = 60_000

export function useTrackedProducts() {
  const [trackedProductsState, setTrackedProductsState] = useState({
    status: 'loading',
    products: [],
    error: '',
  })

  const loadTrackedProducts = useCallback(async ({ background = false } = {}) => {
    if (!background) {
      setTrackedProductsState((s) => ({ ...s, status: 'loading' }))
    }

    try {
      const data = await listTrackedProducts()
      setTrackedProductsState({
        status: 'success',
        products: data.trackedProducts || [],
        error: '',
      })
    } catch (error) {
      if (!background) {
        setTrackedProductsState({
          status: 'error',
          products: [],
          error: error.message || 'Failed to load tracked products',
        })
      }
    }
  }, [])

  useEffect(() => {
    loadTrackedProducts()

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        loadTrackedProducts({ background: true })
      }
    }

    const intervalId = window.setInterval(refreshWhenVisible, DASHBOARD_REFRESH_INTERVAL_MS)
    document.addEventListener('visibilitychange', refreshWhenVisible)

    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [loadTrackedProducts])

  const addProduct = useCallback((trackedProduct) => {
    if (!trackedProduct) return
    setTrackedProductsState((current) => ({
      status: 'success',
      products: [trackedProduct, ...current.products],
      error: '',
    }))
  }, [])

  return {
    status: trackedProductsState.status,
    products: trackedProductsState.products,
    error: trackedProductsState.error,
    addProduct,
    addTrackedProduct: addProduct,
    reload: loadTrackedProducts,
    loadTrackedProducts,
  }
}
