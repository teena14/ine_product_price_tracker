import { jest } from '@jest/globals';

const mockGetProductById = jest.fn();
const mockCreateTrackedProduct = jest.fn();
const mockListTrackedProductsBySession = jest.fn();
const mockGetTrackedProductByIdAndSession = jest.fn();
const mockDeactivateTrackedProduct = jest.fn();

jest.unstable_mockModule('../src/scraper/ineHttpClient.js', () => ({
  getProductById: mockGetProductById,
}));
jest.unstable_mockModule('../src/repositories/trackedProductsRepository.js', () => ({
  createTrackedProduct: mockCreateTrackedProduct,
  listTrackedProductsBySession: mockListTrackedProductsBySession,
  getTrackedProductByIdAndSession: mockGetTrackedProductByIdAndSession,
  deactivateTrackedProduct: mockDeactivateTrackedProduct,
}));

const {
  createTrackedProductForSession,
  deactivateTrackedProductForSession,
  getTrackedProductForSession,
  listTrackedProductsForSession,
} = await import('../src/services/trackedProductsService.js');

describe('trackedProductsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('derives persisted metadata from the INE product, not the browser request', async () => {
    mockGetProductById.mockResolvedValue({
      productId: '2037',
      productUrl: 'https://demo.inelabteamdev.com/products/halvard-headlamp-one',
      name: 'Halvard Headlamp One',
      options: [
        { optionId: 'o1', label: 'Solo' },
        { optionId: 'o2', label: 'Duo' },
      ],
    });
    mockCreateTrackedProduct.mockResolvedValue({ id: 'tracked-id' });

    await expect(
      createTrackedProductForSession({
        productId: '2037',
        optionId: 'o2',
        sessionId: 'a'.repeat(64),
      })
    ).resolves.toEqual({ id: 'tracked-id' });

    expect(mockCreateTrackedProduct).toHaveBeenCalledWith({
      product_id: '2037',
      product_url: 'https://demo.inelabteamdev.com/products/halvard-headlamp-one',
      product_name: 'Halvard Headlamp One',
      option_id: 'o2',
      option_name: 'Duo',
      session_id: 'a'.repeat(64),
    });
  });

  test('rejects an option that is not available for the selected product', async () => {
    mockGetProductById.mockResolvedValue({
      productId: '2037',
      options: [{ optionId: 'o1', label: 'Solo' }],
    });

    await expect(
      createTrackedProductForSession({ productId: '2037', optionId: 'forged-option', sessionId: 'a' })
    ).rejects.toMatchObject({ code: 'INVALID_OPTION' });
    expect(mockCreateTrackedProduct).not.toHaveBeenCalled();
  });

  test('delegates session-scoped reads and deactivation to the repository', async () => {
    await listTrackedProductsForSession('session-a');
    await getTrackedProductForSession('product-id', 'session-a');
    await deactivateTrackedProductForSession('product-id', 'session-a');

    expect(mockListTrackedProductsBySession).toHaveBeenCalledWith('session-a');
    expect(mockGetTrackedProductByIdAndSession).toHaveBeenCalledWith('product-id', 'session-a');
    expect(mockDeactivateTrackedProduct).toHaveBeenCalledWith('product-id', 'session-a');
  });
});
