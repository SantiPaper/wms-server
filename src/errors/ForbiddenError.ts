import { AppError } from '@/errors/AppError';

export class ForbiddenError extends AppError {
  constructor(message = 'No autorizado', code = 'FORBIDDEN') {
    super(403, code, message);
  }
}
