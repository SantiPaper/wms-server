import { Request, Response } from 'express';
import * as inboundService from '@/modules/inbound/inbound.service';
import {
  ApproveReceptionEventInput,
  InboundOrderWebhookInput,
  ScanInput,
} from '@/modules/inbound/inbound.schemas';
import { InboundOrderStatus, ReceptionEventStatus } from '@prisma/client';

export async function inboundOrderWebhookHandler(req: Request, res: Response) {
  const { order, created } = await inboundService.createInboundOrderFromErp(req.body as InboundOrderWebhookInput);
  res.status(created ? 201 : 200).json(order);
}

export async function listInboundOrdersHandler(req: Request, res: Response) {
  const { status } = req.query as { status?: InboundOrderStatus };
  const orders = await inboundService.listInboundOrders({ status });
  res.json(orders);
}

export async function getInboundOrderHandler(req: Request, res: Response) {
  const { id } = req.params as unknown as { id: number };
  const order = await inboundService.getInboundOrderById(id);
  res.json(order);
}

export async function scanHandler(req: Request, res: Response) {
  const { id } = req.params as unknown as { id: number };
  const input = req.body as ScanInput;
  const result = await inboundService.receiveScan(id, input, req.user?.id);

  res.json({
    inboundOrderItemId: result.item.id,
    productId: result.product.id,
    scanned: { good: input.quantityGood, damaged: input.quantityDamaged },
    receivedQuantityTotal: result.item.receivedQuantity,
    damagedQuantityTotal: result.item.damagedQuantity,
    expectedQuantity: result.item.expectedQuantity,
    overReception: result.overReception,
    lpn: result.goodLpn ? { code: result.goodLpn.lpnCode, status: result.goodLpn.status } : null,
    damagedLpn: result.damagedLpn ? { code: result.damagedLpn.lpnCode, status: result.damagedLpn.status } : null,
    orderStatus: result.orderStatus,
  });
}

export async function listReceptionEventsHandler(req: Request, res: Response) {
  const { id } = req.params as unknown as { id: number };
  const { status } = req.query as { status?: ReceptionEventStatus };
  const events = await inboundService.listReceptionEvents(id, status);
  res.json(events);
}

export async function approveReceptionEventHandler(req: Request, res: Response) {
  const { orderId, eventId } = req.params as unknown as { orderId: number; eventId: number };
  const input = req.body as ApproveReceptionEventInput;
  const event = await inboundService.approveReceptionEvent(orderId, eventId, input, req.user!.id);
  res.json(event);
}

export async function completeInboundOrderHandler(req: Request, res: Response) {
  const { id } = req.params as unknown as { id: number };
  const order = await inboundService.completeInboundOrder(id);
  res.json(order);
}
