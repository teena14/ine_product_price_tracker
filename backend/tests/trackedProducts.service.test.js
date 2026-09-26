import { jest } from '@jest/globals';

const mockGetProductById = jest.fn();
const mockCreateTrackedProduct = jest.fn();
const mockListTrackedProductsFromRepository = jest.fn();
const mockGetTrackedProductById = jest.fn();

jest.unstable_mockModule('../src/scraper/ineHttpClient.js', () => ({
  getProductById: mockGetProductById,
}));
jest.unstable_mockModule('../src/repositories/trackedProductsRepository.js', () => ({
  createTrackedProduct: mockCreateTrackedProduct,
  listTrackedProducts: mockListTrackedProductsFromRepository,
  getTrackedProductById: mockGetTrackedProductById,
}));

const {
  createTrackedProductFromSelection,
  getTrackedProduct,
  listTrackedProducts,
} = await import('../src/services/trackedProductsService.js');

describe('trackedProductsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('derives shared tracking metadata from INE, not browser-supplied fields', async () => {
    mockGetProductById.mockResolvedValue({
      productId: '2037',
      productUrl: 'https://demo.inelabteamdev.com/item/2037',
      name: 'Halvard Headlamp One',
      options: [
        { optionId: 'o1', label: 'Solo' },
        { optionId: 'o2', label: 'Duo' },
      ],
    });
    mockCreateTrackedProduct.mockResolvedValue({ id: 'tracked-id' });

    await expect(
      createTrackedProductFromSelection({ productId: '2037', optionId: 'o2' })
    ).resolves.toEqual({ id: 'tracked-id' });

    expect(mockCreateTrackedProduct).toHaveBeenCalledWith({
      product_id: '2037',
      product_url: 'https://demo.inelabteamdev.com/item/2037',
      product_name: 'Halvard Headlamp One',
      option_id: 'o2',
      option_name: 'Duo',
    });
  });

  test('rejects an option that is not available for the selected product', async () => {
    mockGetProductById.mockResolvedValue({
      productId: '2037',
      options: [{ optionId: 'o1', label: 'Solo' }],
    });

    await expect(
      createTrackedProductFromSelection({ productId: '2037', optionId: 'forged-option' })
    ).rejects.toMatchObject({ code: 'INVALID_OPTION' });
    expect(mockCreateTrackedProduct).not.toHaveBeenCalled();
  });

  test('maps an upstream product 404 to PRODUCT_NOT_FOUND', async () => {
    mockGetProductById.mockRejectedValue({ status: 404 });

    await expect(
      createTrackedProductFromSelection({ productId: '9999', optionId: 'o1' })
    ).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
  });

  test('delegates public list and detail reads to the repository', async () => {
    await listTrackedProducts();
    await getTrackedProduct('product-id');

    expect(mockListTrackedProductsFromRepository).toHaveBeenCalledWith();
    expect(mockGetTrackedProductById).toHaveBeenCalledWith('product-id');
  });
});
