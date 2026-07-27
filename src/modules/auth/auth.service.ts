import { prisma } from '@/lib/prismadb';
import { UnauthorizedError } from '@/errors/UnauthorizedError';
import { comparePassword, hashPassword } from '@/modules/auth/password.util';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '@/modules/auth/token.util';
import { PublicUser } from '@/modules/auth/auth.types';

export function toPublicUser(user: { id: number; email: string; role: PublicUser['role'] }): PublicUser {
  return { id: user.id, email: user.email, role: user.role };
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new UnauthorizedError('Credenciales inválidas', 'INVALID_CREDENTIALS');
  }
  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
    throw new UnauthorizedError('Credenciales inválidas', 'INVALID_CREDENTIALS');
  }
  if (!user.isActive) {
    // Same generic error as a wrong password — don't leak account status to the caller.
    throw new UnauthorizedError('Credenciales inválidas', 'INVALID_CREDENTIALS');
  }

  const accessToken = signAccessToken({ sub: user.id, email: user.email, role: user.role });
  const refreshToken = signRefreshToken({ sub: user.id });
  const refreshTokenHash = await hashPassword(refreshToken);
  await prisma.user.update({ where: { id: user.id }, data: { refreshTokenHash } });

  return { accessToken, refreshToken, user: toPublicUser(user) };
}

export async function refresh(refreshToken: string) {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new UnauthorizedError('Refresh token inválido o expirado');
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || !user.refreshTokenHash || !user.isActive) {
    throw new UnauthorizedError('Sesión inválida');
  }
  const matches = await comparePassword(refreshToken, user.refreshTokenHash);
  if (!matches) {
    throw new UnauthorizedError('Sesión inválida');
  }

  const accessToken = signAccessToken({ sub: user.id, email: user.email, role: user.role });
  const newRefreshToken = signRefreshToken({ sub: user.id });
  const refreshTokenHash = await hashPassword(newRefreshToken);
  await prisma.user.update({ where: { id: user.id }, data: { refreshTokenHash } });

  return { accessToken, refreshToken: newRefreshToken, user: toPublicUser(user) };
}

export async function logout(userId: number) {
  await prisma.user.update({ where: { id: userId }, data: { refreshTokenHash: null } });
}

/**
 * Re-checks the user against the DB rather than trusting the JWT payload alone, so a token issued
 * before a deactivation doesn't keep granting access.
 */
export async function getMe(userId: number): Promise<PublicUser> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) {
    throw new UnauthorizedError('Sesión inválida');
  }
  return toPublicUser(user);
}
