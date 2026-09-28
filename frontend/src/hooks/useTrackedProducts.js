import { useCallback, useEffect, useRef, useState } from 'react'
import { listTrackedProducts } from '../api/products'

const DASHBOARD_REFRESH_INTERVAL_MS = 60_000

export function useTrackedProducts() {
  const pendingProductsRef = useRef(new Map())
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
      const fetchedProducts = data.trackedProducts || []
      const fetchedIds = new Set(fetchedProducts.map((product) => product.id))

      for (const productId of fetchedIds) {
        pendingProductsRef.current.delete(productId)
      }

      setTrackedProductsState({
        status: 'success',
        products: [
          ...pendingProductsRef.current.values(),
          ...fetchedProducts,
        ],
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

  // oxlint-disable-next-line react/set-state-in-effect -- intentional async data fetch
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
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

  const addProducts = useCallback((trackedProducts) => {
    const newProducts = (Array.isArray(trackedProducts) ? trackedProducts : [trackedProducts])
      .filter(Boolean)
    if (newProducts.length === 0) return

    for (const product of newProducts) {
      pendingProductsRef.current.set(product.id, product)
    }

    setTrackedProductsState((current) => ({
      status: 'success',
      products: [
        ...newProducts.filter((product) => !current.products.some((currentProduct) => currentProduct.id === product.id)),
        ...current.products,
      ],
      error: '',
    }))
  }, [])

  const addProduct = useCallback((trackedProduct) => {
    addProducts([trackedProduct])
  }, [addProducts])

  return {
    status: trackedProductsState.status,
    products: trackedProductsState.products,
    error: trackedProductsState.error,
    addProduct,
    addProducts,
    addTrackedProduct: addProduct,
    reload: loadTrackedProducts,
    loadTrackedProducts,
  }
}
