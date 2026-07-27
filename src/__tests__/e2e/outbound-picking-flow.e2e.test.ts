import request from 'supertest';
import { createApp } from '@/server/app';
import { prisma } from '@/lib/prismadb';
import { logger } from '@/lib/logger';
import { resetDb, seedBaseline, seedOutboundFixtures, loginAs, webhookHeaders } from '@/__tests__/e2e/testUtils';

const app = createApp();

describe('outbound picking: camino feliz hasta SHIPPED', () => {
  let outbound: Awaited<ReturnType<typeof seedOutboundFixtures>>;

  beforeEach(async () => {
    await resetDb();
    await seedBaseline();
    outbound = await seedOutboundFixtures();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('release -> scan -> pack -> ship, decrementando el stock real y notificando por webhook', async () => {
    const supervisorCookies = await loginAs(app, 'supervisor@test.local');

    const createRes = await request(app)
      .post('/api/v1/integrations/outbound-orders')
      .set(webhookHeaders())
      .send({
        external_order_id: 'PED-HAPPY-1',
        customer_name: 'Cliente Feliz',
        items: [{ barcode: outbound.outProduct.barcode, quantity: 10 }],
      });
    const orderId = createRes.body.id;

    const releaseRes = await request(app)
      .post('/api/v1/outbound-orders/release')
      .set('Cookie', supervisorCookies)
      .send({ orderIds: [orderId] });
    expect(releaseRes.status).toBe(201);
    const task = releaseRes.body.tasks[0];
    expect(task.fromLocationId).toBe(outbound.pickingAisle1.id);

    const infoSpy = jest.spyOn(logger, 'info');

    const scanRes = await request(app)
      .post(`/api/v1/outbound-orders/${orderId}/picking-tasks/${task.id}/scan`)
      .set('Cookie', supervisorCookies)
      .send({ locationCode: outbound.pickingAisle1.locationCode, barcode: outbound.outProduct.barcode });
    expect(scanRes.status).toBe(200);
    expect(scanRes.body.status).toBe('COMPLETED');
    expect(scanRes.body.pickedQuantity).toBe(10);

    const orderAfterScan = await request(app).get(`/api/v1/outbound-orders/${orderId}`).set('Cookie', supervisorCookies);
    expect(orderAfterScan.body.status).toBe('IN_PICKING');

    const packRes = await request(app)
      .post(`/api/v1/outbound-orders/${orderId}/pack`)
      .set('Cookie', supervisorCookies)
      .send({});
    expect(packRes.status).toBe(200);
    expect(packRes.body.status).toBe('PACKED');

    const shipRes = await request(app)
      .post(`/api/v1/outbound-orders/${orderId}/ship`)
      .set('Cookie', supervisorCookies)
      .send({ trackingNumber: 'TRACK-123' });
    expect(shipRes.status).toBe(200);
    expect(shipRes.body.status).toBe('SHIPPED');
    expect(shipRes.body.trackingNumber).toBe('TRACK-123');

    expect(infoSpy).toHaveBeenCalledWith(
      'webhook:order.status_changed',
      expect.objectContaining({ status: 'PACKED' }),
    );
    expect(infoSpy).toHaveBeenCalledWith(
      'webhook:order.status_changed',
      expect.objectContaining({ status: 'SHIPPED', trackingNumber: 'TRACK-123' }),
    );

    const inventoryRes = await request(app)
      .get(`/api/v1/inventory?locationId=${outbound.pickingAisle1.id}`)
      .set('Cookie', supervisorCookies);
    expect(inventoryRes.body[0].quantity).toBe(90);
    expect(inventoryRes.body[0].allocatedQuantity).toBe(0);

    infoSpy.mockRestore();
  });

  it('valida el escaneo en orden estricto: ubicación primero, luego barcode', async () => {
    const supervisorCookies = await loginAs(app, 'supervisor@test.local');
    const createRes = await request(app)
      .post('/api/v1/integrations/outbound-orders')
      .set(webhookHeaders())
      .send({ external_order_id: 'PED-SCAN-1', items: [{ barcode: outbound.outProduct.barcode, quantity: 5 }] });
    const orderId = createRes.body.id;
    const releaseRes = await request(app)
      .post('/api/v1/outbound-orders/release')
      .set('Cookie', supervisorCookies)
      .send({ orderIds: [orderId] });
    const taskId = releaseRes.body.tasks[0].id;

    const wrongLocation = await request(app)
      .post(`/api/v1/outbound-orders/${orderId}/picking-tasks/${taskId}/scan`)
      .set('Cookie', supervisorCookies)
      .send({ locationCode: 'DEP1-Z1-P99-M99-N1', barcode: outbound.outProduct.barcode });
    expect(wrongLocation.status).toBe(400);
    expect(wrongLocation.body.error.code).toBe('WRONG_LOCATION_SCANNED');

    const wrongBarcode = await request(app)
      .post(`/api/v1/outbound-orders/${orderId}/picking-tasks/${taskId}/scan`)
      .set('Cookie', supervisorCookies)
      .send({ locationCode: outbound.pickingAisle1.locationCode, barcode: '0000000000000' });
    expect(wrongBarcode.status).toBe(400);
    expect(wrongBarcode.body.error.code).toBe('WRONG_PRODUCT_SCANNED');
  });

  it('bloquea el pack si quedan tareas de picking sin resolver', async () => {
    const supervisorCookies = await loginAs(app, 'supervisor@test.local');
    const createRes = await request(app)
      .post('/api/v1/integrations/outbound-orders')
      .set(webhookHeaders())
      .send({ external_order_id: 'PED-NOPACK-1', items: [{ barcode: outbound.outProduct.barcode, quantity: 5 }] });
    const orderId = createRes.body.id;
    await request(app)
      .post('/api/v1/outbound-orders/release')
      .set('Cookie', supervisorCookies)
      .send({ orderIds: [orderId] });

    const packRes = await request(app)
      .post(`/api/v1/outbound-orders/${orderId}/pack`)
      .set('Cookie', supervisorCookies)
      .send({});
    expect(packRes.status).toBe(409);
    expect(packRes.body.error.code).toBe('PICKING_NOT_FINISHED');
  });
});
