import { env } from '@/lib/env';
import { createApp } from '@/server/app';
import { logger } from '@/lib/logger';
import { resumePendingDeliveries } from '@/lib/webhook';
import { initRealtime } from '@/lib/realtime';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(`wms-server escuchando en http://localhost:${env.PORT}`);
  // Retoma cualquier webhook saliente que haya quedado PENDING si el proceso murió a mitad de
  // un reintento (ver src/lib/webhook.ts) — no-op en modo stub (sin ERP_WEBHOOK_URL).
  void resumePendingDeliveries();
});

initRealtime(server);

function shutdown() {
  logger.info('Cerrando servidor...');
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
