import { AppError } from "./AppError.js";

export class AuthError extends AppError {
  constructor(
    message: string = "Invalid credentials",
    statusCode = 401,
    cause?: unknown,
  ) {
    super(message, statusCode, cause);
  }
}
