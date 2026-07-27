import { prisma } from '@/lib/prismadb';
import { hashPassword } from '@/modules/auth/password.util';
import { NotFoundError } from '@/errors/NotFoundError';
import { ConflictError } from '@/errors/ConflictError';
import { CreateUserInput, ListUsersQuery, UpdateUserInput } from '@/modules/users/users.schemas';

const USER_SELECT = { id: true, email: true, role: true, isActive: true, createdAt: true } as const;

export async function createUser(data: CreateUserInput) {
  const passwordHash = await hashPassword(data.password);
  return prisma.user.create({
    data: { email: data.email, passwordHash, role: data.role },
    select: USER_SELECT,
  });
}

export async function listUsers(query: ListUsersQuery) {
  const where = {
    ...(query.role ? { role: query.role } : {}),
    ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: USER_SELECT,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      orderBy: { id: 'asc' },
    }),
    prisma.user.count({ where }),
  ]);
  return { items, total, page: query.page, pageSize: query.pageSize };
}

export async function getUserById(id: number) {
  const user = await prisma.user.findUnique({ where: { id }, select: USER_SELECT });
  if (!user) throw new NotFoundError('Usuario no encontrado');
  return user;
}

export async function updateUser(id: number, data: UpdateUserInput, requestingUserId: number) {
  await getUserById(id);
  if (data.isActive === false && id === requestingUserId) {
    throw new ConflictError('No podés desactivar tu propia cuenta', 'SELF_LOCKOUT');
  }
  return prisma.user.update({ where: { id }, data, select: USER_SELECT });
}
