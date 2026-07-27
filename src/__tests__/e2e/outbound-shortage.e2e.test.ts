import request from 'supertest';
import { createApp } from '@/server/app';
import { prisma } from '@/lib/prismadb';
import { resetDb, seedBaseline, seedOutboundFixtures, loginAs, webhookHeaders } from '@/__tests__/e2e/testUtils';

const app = createApp();

describe('falta en posición (stock fantasma)', () => {
  let outbound: Awaited<ReturnType<typeof seedOutboundFixtures>>;

  beforeEach(async () => {
    await resetDb();
    await seedBaseline();
    outbound = await seedOutboundFixtures();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('re-enruta automáticamente a otra ubicación cuando hay alternativa disponible', async () => {
    const supervisorCookies = await loginAs(app, 'supervisor@test.local');

    // Segunda ubicación con el mismo producto, para que el re-enrutamiento tenga adónde ir.
    await prisma.inventory.create({
      data: { productId: outbound.outProduct.id, locationId: outbound.reserveAisle3.id, quantity: 20, status: 'AVAILABLE' },
    });

    const createRes = await request(app)
      .post('/api/v1/integrations/outbound-orders')
      .set(webhookHeaders())
      .send({ external_order_id: 'PED-SHORT-1', items: [{ barcode: outbound.outProduct.barcode, quantity: 10 }] });
    const orderId = createRes.body.id;

    const releaseRes = await request(app)
      .post('/api/v1/outbound-orders/release')
      .set('Cookie', supervisorCookies)
      .send({ orderIds: [orderId] });
    const originalTask = releaseRes.body.tasks[0];
    expect(originalTask.fromLocationId).toBe(outbound.pickingAisle1.id);

    const shortageRes = await request(app)
      .post(`/api/v1/outbound-orders/${orderId}/picking-tasks/${originalTask.id}/report-shortage`)
      .set('Cookie', supervisorCookies)
      .send({ locationCode: outbound.pickingAisle1.locationCode, quantityFound: 0 });

    expect(shortageRes.status).toBe(200);
    expect(shortageRes.body.missingQty).toBe(10);
    expect(shortageRes.body.reroutedQty).toBe(10);
    expect(shortageRes.body.residual).toBe(0);
    expect(shortageRes.body.rerouteTasks).toHaveLength(1);
    const rerouteTask = shortageRes.body.rerouteTasks[0];
    expect(rerouteTask.fromLocationId).toBe(outbound.reserveAisle3.id);
    expect(rerouteTask.rerouteOfTaskId).toBe(originalTask.id);
    expect(rerouteTask.status).toBe('PENDING');

    const phantomInventory = await request(app)
      .get(`/api/v1/inventory?locationId=${outbound.pickingAisle1.id}`)
      .set('Cookie', supervisorCookies);
    expect(phantomInventory.body[0].status).toBe('DISCREPANCY');
    expect(phantomInventory.body[0].quantity).toBe(100); // no se toca, queda como evidencia
    expect(phantomInventory.body[0].allocatedQuantity).toBe(0); // la reserva fantasma se liberó

    const rerouteInventory = await request(app)
      .get(`/api/v1/inventory?locationId=${outbound.reserveAisle3.id}`)
      .set('Cookie', supervisorCookies);
    expect(rerouteInventory.body[0].allocatedQuantity).toBe(10);

    const orderRes = await request(app).get(`/api/v1/outbound-orders/${orderId}`).set('Cookie', supervisorCookies);
    expect(orderRes.body.status).toBe('IN_PICKING'); // no se bloquea
    expect(orderRes.body.items[0].allocatedQuantity).toBe(10); // reserva neta intacta, solo cambió de ubicación
    expect(orderRes.body.items[0].shortedQuantity).toBe(0);

    // la orden puede seguir su curso: completar la tarea reenrutada y despachar
    const scanRes = await request(app)
      .post(`/api/v1/outbound-orders/${orderId}/picking-tasks/${rerouteTask.id}/scan`)
      .set('Cookie', supervisorCookies)
      .send({ locationCode: outbound.reserveAisle3.locationCode, barcode: outbound.outProduct.barcode });
    expect(scanRes.status).toBe(200);
    expect(scanRes.body.status).toBe('COMPLETED');

    const packRes = await request(app)
      .post(`/api/v1/outbound-orders/${orderId}/pack`)
      .set('Cookie', supervisorCookies)
      .send({});
    expect(packRes.status).toBe(200);
  });

  it('deja un faltante visible sin bloquear la orden cuando no hay ninguna alternativa', async () => {
    const supervisorCookies = await loginAs(app, 'supervisor@test.local');

    const createRes = await request(app)
      .post('/api/v1/integrations/outbound-orders')
      .set(webhookHeaders())
      .send({ external_order_id: 'PED-SHORT-2', items: [{ barcode: outbound.outBatchProduct.barcode, quantity: 20 }] });
    const orderId = createRes.body.id;

    const releaseRes = await request(app)
      .post('/api/v1/outbound-orders/release')
      .set('Cookie', supervisorCookies)
      .send({ orderIds: [orderId] });
    const task = releaseRes.body.tasks[0];
    expect(task.fromLocationId).toBe(outbound.reserveAisle1.id);

    const shortageRes = await request(app)
      .post(`/api/v1/outbound-orders/${orderId}/picking-tasks/${task.id}/report-shortage`)
      .set('Cookie', supervisorCookies)
      .send({ locationCode: outbound.reserveAisle1.locationCode, quantityFound: 0 });

    expect(shortageRes.status).toBe(200);
    expect(shortageRes.body.reroutedQty).toBe(0);
    expect(shortageRes.body.residual).toBe(20);
    expect(shortageRes.body.rerouteTasks).toHaveLength(0);

    const orderRes = await request(app).get(`/api/v1/outbound-orders/${orderId}`).set('Cookie', supervisorCookies);
    expect(orderRes.body.status).toBe('IN_PICKING');
    expect(orderRes.body.items[0].allocatedQuantity).toBe(0);
    expect(orderRes.body.items[0].shortedQuantity).toBe(20);

    // la única tarea quedó en SHORTAGE (terminal) — la orden puede seguir hacia pack/ship igual
    const packRes = await request(app)
      .post(`/api/v1/outbound-orders/${orderId}/pack`)
      .set('Cookie', supervisorCookies)
      .send({});
    expect(packRes.status).toBe(200);
    expect(packRes.body.status).toBe('PACKED');
  });
});
