import { AppError } from '@/errors/AppError';

export class NotFoundError extends AppError {
  constructor(message = 'No encontrado', code = 'NOT_FOUND') {
    super(404, code, message);
  }
}
