import { Request, Response } from 'express';
import { PickingTaskStatus } from '@prisma/client';
import * as outboundService from '@/modules/outbound/outbound.service';
import * as pickingService from '@/modules/outbound/picking.service';
import { ReportShortageInput, ScanTaskInput } from '@/modules/outbound/outbound.schemas';

export async function listPickingTasksHandler(req: Request, res: Response) {
  const { orderId } = req.params as unknown as { orderId: number };
  const { status } = req.query as { status?: PickingTaskStatus };
  const tasks = await outboundService.listPickingTasks(orderId, status);
  res.json(tasks);
}

export async function scanTaskHandler(req: Request, res: Response) {
  const { orderId, taskId } = req.params as unknown as { orderId: number; taskId: number };
  const task = await pickingService.scanTask(orderId, taskId, req.body as ScanTaskInput);
  res.json(task);
}

export async function reportShortageHandler(req: Request, res: Response) {
  const { orderId, taskId } = req.params as unknown as { orderId: number; taskId: number };
  const result = await pickingService.reportShortage(orderId, taskId, req.body as ReportShortageInput);
  res.json(result);
}

export async function claimNextTaskHandler(req: Request, res: Response) {
  const task = await pickingService.claimNextTask(req.user!.id);
  if (!task) {
    res.status(204).end();
    return;
  }
  res.json(task);
}
