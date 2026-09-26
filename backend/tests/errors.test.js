import { AppError, errors } from '../src/utils/errors.js';

describe('AppError', () => {
  test('preserves code, message, statusCode, details, and a useful stack', () => {
    const details = [{ field: 'optionId', message: 'Option is required' }];
    const error = new AppError('VALIDATION_ERROR', 'Invalid request', 400, details);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('AppError');
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.message).toBe('Invalid request');
    expect(error.statusCode).toBe(400);
    expect(error.details).toEqual(details);
    expect(error.stack).toContain('AppError');
  });

  test('defaults safe details to an empty array', () => {
    const error = new AppError('INTERNAL_ERROR', 'Unexpected failure');

    expect(error.statusCode).toBe(500);
    expect(error.details).toEqual([]);
  });

  test('validation factory forwards safe field details', () => {
    const error = errors.validationError('optionId is required', [{ field: 'optionId' }]);

    expect(error).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'optionId is required',
      statusCode: 400,
      details: [{ field: 'optionId' }],
    });
  });
});
