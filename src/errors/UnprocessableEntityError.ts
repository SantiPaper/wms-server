import { AppError } from '@/errors/AppError';

export class UnprocessableEntityError extends AppError {
  constructor(message: string, code = 'UNPROCESSABLE_ENTITY', details?: unknown) {
    super(422, code, message, details);
  }
}
