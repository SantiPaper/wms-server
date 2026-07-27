import { Router } from 'express';
import { authRouter } from '@/modules/auth/auth.router';
import { productosRouter } from '@/modules/productos/productos.router';
import { ubicacionesRouter } from '@/modules/ubicaciones/ubicaciones.router';
import { lpnsRouter } from '@/modules/lpns/lpns.router';
import { inventarioRouter } from '@/modules/inventario/inventario.router';
import { inboundIntegrationsRouter, inboundRouter } from '@/modules/inbound/inbound.router';
import { outboundIntegrationsRouter, outboundRouter } from '@/modules/outbound/outbound.router';
import { wavesRouter } from '@/modules/outbound/waves.router';
import { pickingQueueRouter } from '@/modules/outbound/picking-queue.router';
import { usersRouter } from '@/modules/users/users.router';
import { reportsRouter } from '@/modules/reports/reports.router';
import { webhookDeliveriesRouter } from '@/modules/webhook-deliveries/webhook-deliveries.router';

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => res.json({ ok: true }));

apiRouter.use('/auth', authRouter);
apiRouter.use('/products', productosRouter);
apiRouter.use('/locations', ubicacionesRouter);
apiRouter.use('/lpns', lpnsRouter);
apiRouter.use('/inventory', inventarioRouter);
apiRouter.use('/integrations', inboundIntegrationsRouter);
apiRouter.use('/integrations', outboundIntegrationsRouter);
apiRouter.use('/inbound-orders', inboundRouter);
apiRouter.use('/outbound-orders', outboundRouter);
apiRouter.use('/picking-waves', wavesRouter);
apiRouter.use('/picking-tasks', pickingQueueRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/reports', reportsRouter);
apiRouter.use('/webhook-deliveries', webhookDeliveriesRouter);
