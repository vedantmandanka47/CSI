import { RequestIdMiddleware } from './request-id.middleware.js';
import { Request, Response } from 'express';

describe('RequestIdMiddleware', () => {
  let middleware: RequestIdMiddleware;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: jest.Mock;

  beforeEach(() => {
    middleware = new RequestIdMiddleware();
    mockRequest = {
      headers: {},
    };
    mockResponse = {
      setHeader: jest.fn(),
    };
    nextFunction = jest.fn();
  });

  it('generates a new UUID when incoming request has no x-request-id header', () => {
    middleware.use(mockRequest as Request, mockResponse as Response, nextFunction);

    const generatedId = mockRequest.headers!['x-request-id'];
    expect(generatedId).toBeDefined();
    expect(typeof generatedId).toBe('string');
    expect(generatedId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(mockResponse.setHeader).toHaveBeenCalledWith('X-Request-Id', generatedId);
    expect(nextFunction).toHaveBeenCalled();
  });

  it('preserves incoming x-request-id header and reflects it in response header', () => {
    const existingId = 'client-trace-id-abc-123';
    mockRequest.headers!['x-request-id'] = existingId;

    middleware.use(mockRequest as Request, mockResponse as Response, nextFunction);

    expect(mockRequest.headers!['x-request-id']).toBe(existingId);
    expect(mockResponse.setHeader).toHaveBeenCalledWith('X-Request-Id', existingId);
    expect(nextFunction).toHaveBeenCalled();
  });
});

