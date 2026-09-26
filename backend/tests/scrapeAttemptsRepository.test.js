import { validateScrapeAttempt } from '../src/repositories/scrapeAttemptsRepository.js';

const BASE_ATTEMPT = {
  tracked_product_id: 'a0b1c2d3-e4f5-4a67-8b9c-0d1e2f3a4b5c',
  run_id: 'run-a',
  attempt_number: 1,
  duration_ms: 250,
};

describe('scrape attempt business rules', () => {
  test('accepts a successful attempt only with a validated price and stock', () => {
    const attempt = {
      ...BASE_ATTEMPT,
      price: 199.99,
      stock: 0,
      outcome: 'success',
      error_code: null,
      error_message: null,
    };

    expect(validateScrapeAttempt(attempt)).toBe(attempt);
  });

  test.each(['retried', 'failed'])('%s leaves price and stock empty but records an error', (outcome) => {
    const attempt = {
      ...BASE_ATTEMPT,
      price: null,
      stock: null,
      outcome,
      error_code: 'SCRAPE_TIMEOUT',
      error_message: 'Timed out waiting for a quote',
    };

    expect(validateScrapeAttempt(attempt)).toBe(attempt);
  });

  test('rejects a failure with fabricated quote data or missing failure context', () => {
    expect(() =>
      validateScrapeAttempt({
        ...BASE_ATTEMPT,
        price: 99,
        stock: 0,
        outcome: 'failed',
        error_code: 'SCRAPE_TIMEOUT',
        error_message: 'Timed out',
      })
    ).toThrow('Invalid scrape attempt payload');

    expect(() =>
      validateScrapeAttempt({
        ...BASE_ATTEMPT,
        price: null,
        stock: null,
        outcome: 'retried',
        error_code: null,
        error_message: null,
      })
    ).toThrow('Invalid scrape attempt payload');
  });

  test('allows attempt numbers to reset for a distinct run', () => {
    const firstRun = {
      ...BASE_ATTEMPT,
      price: 100,
      stock: 3,
      outcome: 'success',
      error_code: null,
      error_message: null,
      run_id: 'run-a',
      attempt_number: 1,
    };
    const nextRun = { ...firstRun, run_id: 'run-b', attempt_number: 1 };

    expect(validateScrapeAttempt(firstRun)).toBe(firstRun);
    expect(validateScrapeAttempt(nextRun)).toBe(nextRun);
  });
});
