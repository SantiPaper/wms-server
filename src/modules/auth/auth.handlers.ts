import { Request, Response } from 'express';
import * as authService from '@/modules/auth/auth.service';
import { LoginInput } from '@/modules/auth/auth.schemas';
import { setAuthCookies, clearAuthCookies } from '@/modules/auth/cookie.util';
import { UnauthorizedError } from '@/errors/UnauthorizedError';

export async function loginHandler(req: Request, res: Response) {
  const { email, password } = req.body as LoginInput;
  const { accessToken, refreshToken, user } = await authService.login(email, password);
  setAuthCookies(res, accessToken, refreshToken);
  res.json({ user });
}

export async function refreshHandler(req: Request, res: Response) {
  const refreshToken = req.cookies?.refresh_token;
  if (!refreshToken) {
    throw new UnauthorizedError('Falta refresh token');
  }
  const result = await authService.refresh(refreshToken);
  setAuthCookies(res, result.accessToken, result.refreshToken);
  res.json({ ok: true });
}

export async function logoutHandler(req: Request, res: Response) {
  if (req.user) {
    await authService.logout(req.user.id);
  }
  clearAuthCookies(res);
  res.json({ ok: true });
}

export async function meHandler(req: Request, res: Response) {
  const user = await authService.getMe(req.user!.id);
  res.json({ user });
}
