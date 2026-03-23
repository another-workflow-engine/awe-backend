import { AppError } from "./AppError.js";

export class InvalidOperationError extends AppError {
  constructor(message: string) {
    super(message, 400);
  }
}