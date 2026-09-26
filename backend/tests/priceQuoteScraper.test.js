import {
  QuoteScraperError,
  parseDisplayedPrice,
  parseDisplayedStock,
  validateQuote,
} from '../src/scraper/priceQuoteScraper.js';

describe('price quote parsing and validation', () => {
  test('parses Indian-formatted and full-width displayed prices', () => {
    expect(parseDisplayedPrice('\u20B918,145')).toBe(18145);
    expect(parseDisplayedPrice('\u20B9\uFF11\uFF18,\uFF11\uFF14\uFF15.\uFF15\uFF10')).toBe(18145.5);
  });

  test('normalizes real full-width Unicode digits before parsing', () => {
    expect(parseDisplayedPrice('\u20B9\uFF11\uFF18,\uFF11\uFF14\uFF15.\uFF15\uFF10')).toBe(18145.5);
  });

  test('rejects missing, malformed, and zero prices', () => {
    expect(() => parseDisplayedPrice('Price unavailable')).toThrow(QuoteScraperError);
    expect(() => parseDisplayedPrice('₹0')).toThrow('positive number');
  });

  test('parses stock variants but does not convert missing stock to zero', () => {
    expect(parseDisplayedStock('Available (12)')).toBe(12);
    expect(parseDisplayedStock('Last few: 3')).toBe(3);
    expect(parseDisplayedStock('Out of stock')).toBe(0);
    expect(() => parseDisplayedStock('Check stock at checkout')).toThrow('missing or malformed');
  });

  test('accepts only a positive price and non-negative integer stock', () => {
    expect(validateQuote({ price: 199.99, stock: 0 })).toEqual({ price: 199.99, stock: 0 });
    expect(() => validateQuote({ price: NaN, stock: 3 })).toThrow('Price failed validation');
    expect(() => validateQuote({ price: 50, stock: 2.5 })).toThrow('Stock failed validation');
  });
});
