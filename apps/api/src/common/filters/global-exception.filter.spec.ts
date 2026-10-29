import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { GlobalExceptionFilter } from './global-exception.filter.js';
import { ErrorCode } from '@csi/shared';
import { z, ZodError } from 'zod';

describe('GlobalExceptionFilter (ARCH-15, Section 14.1)', () => {
  let filter: GlobalExceptionFilter;
  let mockResponse: {
    status: jest.Mock;
    json: jest.Mock;
    setHeader: jest.Mock;
    getHeader: jest.Mock;
  };
  let mockRequest: {
    headers: Record<string, string>;
  };
  let mockHost: ArgumentsHost;

  beforeEach(() => {
    filter = new GlobalExceptionFilter();
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn(),
      getHeader: jest.fn().mockReturnValue(undefined),
    };
    mockRequest = {
      headers: {},
    };
    mockHost = {
      switchToHttp: jest.fn().mockReturnValue({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    } as unknown as ArgumentsHost;
  });

  it('formats standard HttpException with correct status and error code', () => {
    const exception = new HttpException('Resource not found', HttpStatus.NOT_FOUND);

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(404);
    expect(mockResponse.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(mockResponse.json).toHaveBeenCalledWith({
      error: {
        code: ErrorCode.NOT_FOUND,
        message: 'Resource not found',
        fields: {},
      },
    });
  });

  it('formats 403 Forbidden exception into FORBIDDEN error code', () => {
    const exception = new HttpException('Access denied', HttpStatus.FORBIDDEN);

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(403);
    expect(mockResponse.json).toHaveBeenCalledWith({
      error: {
        code: ErrorCode.FORBIDDEN,
        message: 'Access denied',
        fields: {},
      },
    });
  });

  it('formats ZodError into VALIDATION_ERROR with mapped fields', () => {
    const schema = z.object({
      email: z.string().email('Invalid email address'),
      age: z.number().min(18, 'Must be at least 18'),
    });

    let zodError: ZodError | null = null;
    try {
      schema.parse({ email: 'not-an-email', age: 16 });
    } catch (err) {
      if (err instanceof ZodError) {
        zodError = err;
      }
    }

    expect(zodError).not.toBeNull();
    filter.catch(zodError!, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith({
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Validation failed',
        fields: {
          email: 'Invalid email address',
          age: 'Must be at least 18',
        },
      },
    });
  });

  it('masks unhandled 500 exceptions and prevents stack trace leakage (ARCH-15)', () => {
    const internalError = new Error('Database connection failed with sensitive password DB_PASS=secret');

    filter.catch(internalError, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(500);
    expect(mockResponse.json).toHaveBeenCalledWith({
      error: {
        code: ErrorCode.INTERNAL_SERVER_ERROR,
        message: 'An unexpected server error occurred.',
        fields: {},
      },
    });
    // Verify sensitive error is NOT exposed in response json
    const jsonArg = mockResponse.json.mock.calls[0][0];
    expect(JSON.stringify(jsonArg)).not.toContain('DB_PASS');
  });

  it('preserves existing X-Request-Id from request header', () => {
    mockRequest.headers['x-request-id'] = 'custom-trace-id-1234';
    const exception = new HttpException('Bad Request', HttpStatus.BAD_REQUEST);

    filter.catch(exception, mockHost);

    expect(mockResponse.setHeader).toHaveBeenCalledWith('X-Request-Id', 'custom-trace-id-1234');
  });
});

