import { Request, Response } from 'express';
import * as reportsService from '@/modules/reports/reports.service';
import { ThroughputQuery } from '@/modules/reports/reports.schemas';

export async function pendingApprovalsHandler(_req: Request, res: Response) {
  const result = await reportsService.getPendingApprovals();
  res.json(result);
}

export async function discrepanciesHandler(_req: Request, res: Response) {
  const result = await reportsService.getDiscrepancies();
  res.json(result);
}

export async function inventorySummaryHandler(_req: Request, res: Response) {
  const result = await reportsService.getInventorySummary();
  res.json(result);
}

export async function throughputHandler(req: Request, res: Response) {
  const { since } = req.query as unknown as ThroughputQuery;
  const result = await reportsService.getThroughput(since);
  res.json(result);
}
