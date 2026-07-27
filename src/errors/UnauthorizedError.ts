import { AppError } from '@/errors/AppError';

export class UnauthorizedError extends AppError {
  constructor(message = 'No autenticado', code = 'UNAUTHORIZED') {
    super(401, code, message);
  }
}
