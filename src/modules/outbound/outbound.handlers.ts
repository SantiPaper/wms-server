import { Request, Response } from 'express';
import { OutboundOrderStatus } from '@prisma/client';
import * as outboundService from '@/modules/outbound/outbound.service';
import { releaseWave } from '@/modules/outbound/allocation.service';
import {
  OutboundOrderWebhookInput,
  ReleaseWaveInput,
  ShipOrderInput,
} from '@/modules/outbound/outbound.schemas';

export async function outboundOrderWebhookHandler(req: Request, res: Response) {
  const { order, created } = await outboundService.createOutboundOrderFromErp(req.body as OutboundOrderWebhookInput);
  res.status(created ? 201 : 200).json(order);
}

export async function listOutboundOrdersHandler(req: Request, res: Response) {
  const { status } = req.query as { status?: OutboundOrderStatus };
  const orders = await outboundService.listOutboundOrders({ status });
  res.json(orders);
}

export async function getOutboundOrderHandler(req: Request, res: Response) {
  const { id } = req.params as unknown as { id: number };
  const order = await outboundService.getOutboundOrderById(id);
  res.json(order);
}

export async function releaseWaveHandler(req: Request, res: Response) {
  const { orderIds } = req.body as ReleaseWaveInput;
  const result = await releaseWave(orderIds, req.user?.id);
  res.status(201).json(result);
}

export async function packOrderHandler(req: Request, res: Response) {
  const { id } = req.params as unknown as { id: number };
  const order = await outboundService.packOrder(id);
  res.json(order);
}

export async function shipOrderHandler(req: Request, res: Response) {
  const { id } = req.params as unknown as { id: number };
  const order = await outboundService.shipOrder(id, req.body as ShipOrderInput);
  res.json(order);
}
