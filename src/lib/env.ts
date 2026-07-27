import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  JWT_ACCESS_SECRET: z.string().min(1),
  JWT_REFRESH_SECRET: z.string().min(1),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),
  // Comma-separated list — the wms-client (supervisión) and wms-pwa (colectoras) dev servers,
  // plus the Tauri desktop webview's origins (which differ from a plain browser: WebView2 on
  // Windows serves the packaged app from https://tauri.localhost, other platforms use
  // tauri://localhost).
  CORS_ORIGIN: z
    .string()
    .default('http://localhost:3000,http://localhost:3001,tauri://localhost,https://tauri.localhost')
    .transform((v) => v.split(',').map((origin) => origin.trim())),
  ERP_WEBHOOK_SECRET: z.string().min(1),
  // Sin configurar (default en dev/tests): sendWebhook() se queda en modo stub (solo logea, sin
  // intentar una entrega real) — no hay un ERP real todavía, ver README. Cuando exista, alcanza
  // con setear esta URL para que empiece a entregar de verdad con reintentos.
  ERP_WEBHOOK_URL: z.string().url().optional(),
  ERP_WEBHOOK_TIMEOUT_MS: z.coerce.number().default(5000),
  ERP_WEBHOOK_MAX_RETRIES: z.coerce.number().default(3),
  ENFORCE_WEIGHT_LIMITS: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
});

export const env = envSchema.parse(process.env);
