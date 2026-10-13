export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(statusCode: number, message: string, code = 'ERROR', details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  static badRequest(message: string, code = 'BAD_REQUEST', details?: unknown) {
    return new ApiError(400, message, code, details);
  }
  static validation(message: string, details?: unknown) {
    return new ApiError(422, message, 'VALIDATION_ERROR', details);
  }
  static unauthorized(message = 'Authentication required') {
    return new ApiError(401, message, 'UNAUTHORIZED');
  }
  static forbidden(message = 'You do not have permission to perform this action') {
    return new ApiError(403, message, 'FORBIDDEN');
  }
  static notFound(entity = 'Resource') {
    return new ApiError(404, `${entity} not found`, 'NOT_FOUND');
  }
  static conflict(message: string, code = 'CONFLICT', details?: unknown) {
    return new ApiError(409, message, code, details);
  }
  static internal(message = 'Unexpected server error') {
    return new ApiError(500, message, 'INTERNAL_ERROR');
  }
}
