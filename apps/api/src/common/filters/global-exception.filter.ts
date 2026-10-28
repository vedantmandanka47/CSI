import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { createErrorEnvelope, ErrorCode } from '@csi/shared';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const requestId =
      (request.headers['x-request-id'] as string) ||
      (response.getHeader('x-request-id') as string) ||
      'unknown-req';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: string = ErrorCode.INTERNAL_SERVER_ERROR;
    let message = 'An unexpected server error occurred.';
    let fields: Record<string, string | string[]> = {};

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'string') {
        message = res;
        code = this.httpStatusToErrorCode(status);
      } else if (typeof res === 'object' && res !== null) {
        const obj = res as Record<string, unknown>;
        code = typeof obj.code === 'string' ? obj.code : this.httpStatusToErrorCode(status);
        message =
          typeof obj.message === 'string'
            ? obj.message
            : exception.message || message;
        fields =
          typeof obj.fields === 'object' && obj.fields !== null
            ? (obj.fields as Record<string, string | string[]>)
            : {};

        // NestJS validation pipe default shape: { message: string[] }
        if (Array.isArray(obj.message)) {
          message = 'Validation failed';
          code = ErrorCode.VALIDATION_ERROR;
          fields = { _all: obj.message as string[] };
        }
      }
    } else {
      // 500 Server error — log full error internally with requestId, never leak stack trace to client
      this.logger.error(
        `[Request ${requestId}] Unhandled exception: ${exception instanceof Error ? exception.message : 'Unknown'}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    // ARCH-15: Never leak stack traces, SQL queries, or file paths
    // Set headers
    response.setHeader('X-Request-Id', requestId);
    response.setHeader('Content-Type', 'application/json');

    // Authenticated/error responses must never be cached (SEC-02)
    response.setHeader('Cache-Control', 'no-store');

    response.status(status).json(createErrorEnvelope(code, message, fields));
  }

  private httpStatusToErrorCode(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ErrorCode.VALIDATION_ERROR;
      case HttpStatus.UNAUTHORIZED:
        return ErrorCode.UNAUTHENTICATED;
      case HttpStatus.FORBIDDEN:
        return ErrorCode.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ErrorCode.NOT_FOUND;
      case HttpStatus.CONFLICT:
        return ErrorCode.CONFLICT;
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return ErrorCode.VALIDATION_ERROR;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ErrorCode.RATE_LIMITED;
      default:
        return ErrorCode.INTERNAL_SERVER_ERROR;
    }
  }
}
