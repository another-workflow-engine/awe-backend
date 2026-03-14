export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational = true;
  public readonly cause : unknown;

  constructor(message: string, statusCode = 500, cause?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.cause = cause;

    Error.captureStackTrace(this, this.constructor);
  }
}
