import { Role } from '@prisma/client';

export interface PublicUser {
  id: number;
  email: string;
  role: Role;
}
