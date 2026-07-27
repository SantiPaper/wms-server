import { Response } from 'express';
import { env } from '@/lib/env';

function parseDurationMs(duration: string): number {
  const match = /^(\d+)(s|m|h|d)$/.exec(duration);
  if (!match) return 15 * 60 * 1000;
  const value = Number(match[1]);
  const unit = match[2];
  const unitMs = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit] ?? 60_000;
  return value * unitMs;
}

// En dev, frontend (3000/3001) y backend (4000) comparten "sitio" (mismo host, distinto puerto)
// así que sameSite=lax alcanza. En producción, sin un dominio propio compartido entre el panel
// (Vercel) y la API (Render), son sitios distintos de verdad — hace falta sameSite=none (que
// exige secure=true, ya cierto en producción) para que el navegador mande la cookie en el fetch
// cross-site. No seteamos `domain`: sin dominio compartido no ayuda, y de quedar mal configurado
// (ej. apuntando a "localhost" en producción) el navegador directamente rechaza la cookie entera.
const sameSite: 'lax' | 'none' = env.NODE_ENV === 'production' ? 'none' : 'lax';

const baseCookieOptions = {
  httpOnly: true,
  sameSite,
  secure: env.NODE_ENV === 'production',
};

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
  res.cookie('access_token', accessToken, {
    ...baseCookieOptions,
    maxAge: parseDurationMs(env.JWT_ACCESS_TTL),
  });
  res.cookie('refresh_token', refreshToken, {
    ...baseCookieOptions,
    maxAge: parseDurationMs(env.JWT_REFRESH_TTL),
  });
}

export function clearAuthCookies(res: Response) {
  res.clearCookie('access_token', baseCookieOptions);
  res.clearCookie('refresh_token', baseCookieOptions);
}
