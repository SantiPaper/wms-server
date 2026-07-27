import { AppError } from '@/errors/AppError';

export class BadRequestError extends AppError {
  constructor(message: string, code = 'BAD_REQUEST', details?: unknown) {
    super(400, code, message, details);
  }
}
