import { Router } from 'express';
import { Role } from '@prisma/client';
import { asyncHandler } from '@/lib/asyncHandler';
import { validate } from '@/middlewares/validate';
import { requireAuth } from '@/middlewares/requireAuth';
import { requireRole } from '@/middlewares/requireRole';
import { throughputQuerySchema } from '@/modules/reports/reports.schemas';
import {
  discrepanciesHandler,
  inventorySummaryHandler,
  pendingApprovalsHandler,
  throughputHandler,
} from '@/modules/reports/reports.handlers';

export const reportsRouter = Router();

reportsRouter.use(requireAuth);
reportsRouter.use(requireRole(Role.SUPERVISOR, Role.ADMIN));

reportsRouter.get('/pending-approvals', asyncHandler(pendingApprovalsHandler));
reportsRouter.get('/discrepancies', asyncHandler(discrepanciesHandler));
reportsRouter.get('/inventory-summary', asyncHandler(inventorySummaryHandler));
reportsRouter.get('/throughput', validate(throughputQuerySchema, 'query'), asyncHandler(throughputHandler));
