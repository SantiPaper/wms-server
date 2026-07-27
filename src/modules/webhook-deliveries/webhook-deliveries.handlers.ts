import { Request, Response } from 'express';
import * as webhookDeliveriesService from '@/modules/webhook-deliveries/webhook-deliveries.service';
import { ListWebhookDeliveriesQuery } from '@/modules/webhook-deliveries/webhook-deliveries.schemas';
import { IdParam } from '@/lib/common.schemas';

export async function listWebhookDeliveriesHandler(req: Request, res: Response) {
  const result = await webhookDeliveriesService.listWebhookDeliveries(
    req.query as unknown as ListWebhookDeliveriesQuery,
  );
  res.json(result);
}

export async function getWebhookDeliveryHandler(req: Request, res: Response) {
  const { id } = req.params as unknown as IdParam;
  const delivery = await webhookDeliveriesService.getWebhookDeliveryById(id);
  res.json(delivery);
}

export async function retryWebhookDeliveryHandler(req: Request, res: Response) {
  const { id } = req.params as unknown as IdParam;
  const delivery = await webhookDeliveriesService.retryWebhookDelivery(id);
  res.json(delivery);
}
