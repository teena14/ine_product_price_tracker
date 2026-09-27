import { useCallback, useRef, useState } from 'react'
import { createTrackedProduct, getProduct } from '../api/products'

export function useProductSelection({ onProductsTracked } = {}) {
  const [detailState, setDetailState] = useState({ status: 'idle', data: null, error: '' })
  const [selectedOptionId, setSelectedOptionId] = useState('')
  const [trackingState, setTrackingState] = useState({ status: 'idle', error: '' })
  const configSectionRef = useRef(null)

  const clearSelection = useCallback(() => {
    setDetailState({ status: 'idle', data: null, error: '' })
    setSelectedOptionId('')
    setTrackingState({ status: 'idle', error: '' })
  }, [])

  const handleBulkTrackingComplete = useCallback((trackedProducts) => {
    onProductsTracked?.(trackedProducts)
    clearSelection()
  }, [clearSelection, onProductsTracked])

  const handleSelectProduct = useCallback(async (productId) => {
    setDetailState({ status: 'loading', data: null, error: '' })
    setSelectedOptionId('')
    setTrackingState({ status: 'idle', error: '' })

    try {
      const data = await getProduct(productId)
      setDetailState({ status: 'success', data, error: '' })
      requestAnimationFrame(() => {
        configSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    } catch (error) {
      setDetailState({
        status: 'error',
        data: null,
        error: error.message || 'Failed to fetch product details',
      })
    }
  }, [])

  const handleTrackOption = useCallback(async () => {
    const selectedProduct = detailState.data
    const selectedOption = selectedProduct?.options?.find((o) => o.optionId === selectedOptionId)
    if (!selectedProduct || !selectedOption) return

    setTrackingState({ status: 'loading', error: '' })

    try {
      const trackedProduct = await createTrackedProduct({
        productId: selectedProduct.productId,
        optionId: selectedOption.optionId,
      })

      handleBulkTrackingComplete([trackedProduct])
      return trackedProduct
    } catch (error) {
      setTrackingState({
        status: 'error',
        error: error.message || 'Failed to track product option',
      })
    }
  }, [detailState.data, selectedOptionId, handleBulkTrackingComplete])

  const selectedProduct = detailState.data
  const selectedOption = selectedProduct?.options?.find((o) => o.optionId === selectedOptionId)

  return {
    detailState,
    selectedProduct,
    selectedOptionId,
    setSelectedOptionId,
    selectedOption,
    trackingState,
    configSectionRef,
    handleSelectProduct,
    selectProduct: handleSelectProduct,
    handleTrackOption,
    trackSelectedOption: handleTrackOption,
    handleBulkTrackingComplete,
  }
}
