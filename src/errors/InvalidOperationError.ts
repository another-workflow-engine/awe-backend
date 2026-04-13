import { AppError } from "./AppError.js";

export class InvalidOperationError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(message, 400, cause);
  }
}
