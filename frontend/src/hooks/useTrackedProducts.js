import { useCallback, useEffect, useState } from 'react'
import { listTrackedProducts } from '../api/products'

export function useTrackedProducts() {
  const [trackedProductsState, setTrackedProductsState] = useState({
    status: 'loading',
    products: [],
    error: '',
  })

  const loadTrackedProducts = useCallback(async () => {
    setTrackedProductsState((s) => ({ ...s, status: 'loading' }))
    try {
      const data = await listTrackedProducts()
      setTrackedProductsState({
        status: 'success',
        products: data.trackedProducts || [],
        error: '',
      })
    } catch (error) {
      setTrackedProductsState({
        status: 'error',
        products: [],
        error: error.message || 'Failed to load tracked products',
      })
    }
  }, [])

  useEffect(() => {
    loadTrackedProducts()
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
