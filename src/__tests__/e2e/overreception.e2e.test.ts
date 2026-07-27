import request from 'supertest';
import { createApp } from '@/server/app';
import { prisma } from '@/lib/prismadb';
import { logger } from '@/lib/logger';
import { resetDb, seedBaseline, loginAs, webhookHeaders } from '@/__tests__/e2e/testUtils';

const app = createApp();

describe('sobre-recepción (over-reception) requiere aprobación', () => {
  let fixtures: Awaited<ReturnType<typeof seedBaseline>>;

  beforeEach(async () => {
    await resetDb();
    fixtures = await seedBaseline();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createOrderAndOverScan(externalId: string) {
    const operarioCookies = await loginAs(app, 'operario@test.local');
    const createRes = await request(app)
      .post('/api/v1/integrations/inbound-orders')
      .set(webhookHeaders())
      .send({
        external_id: externalId,
        supplier_code: 'SUP-1',
        items: [{ barcode: fixtures.product.barcode, expected_quantity: 10 }],
      });
    const orderId = createRes.body.id;

    const scanRes = await request(app)
      .post(`/api/v1/inbound-orders/${orderId}/scan`)
      .set('Cookie', operarioCookies)
      .send({ barcode: fixtures.product.barcode, quantityGood: 15 });

    return { orderId, scanRes, operarioCookies };
  }

  it('clampea lo recibido a lo esperado y deja el excedente pendiente de aprobación', async () => {
    const { scanRes, orderId, operarioCookies } = await createOrderAndOverScan('OC-OVR-1');

    expect(scanRes.status).toBe(200);
    expect(scanRes.body.overReception.triggered).toBe(true);
    expect(scanRes.body.overReception.excessQuantity).toBe(5);
    expect(scanRes.body.receivedQuantityTotal).toBe(10);
    expect(scanRes.body.orderStatus).toBe('IN_RECEIVING');

    const pendingRes = await request(app)
      .get(`/api/v1/inbound-orders/${orderId}/reception-events?status=PENDING_APPROVAL`)
      .set('Cookie', operarioCookies);
    expect(pendingRes.body).toHaveLength(1);
    expect(pendingRes.body[0].quantity).toBe(5);
  });

  it('OPERARIO no puede aprobar; SUPERVISOR sí, y eso suma el excedente al stock', async () => {
    const { scanRes, orderId, operarioCookies } = await createOrderAndOverScan('OC-OVR-2');
    const eventId = scanRes.body.overReception.pendingEventId;

    const deniedRes = await request(app)
      .post(`/api/v1/inbound-orders/${orderId}/reception-events/${eventId}/approve`)
      .set('Cookie', operarioCookies)
      .send({ decision: 'APPROVE' });
    expect(deniedRes.status).toBe(403);

    const infoSpy = jest.spyOn(logger, 'info');

    const supervisorCookies = await loginAs(app, 'supervisor@test.local');
    const approveRes = await request(app)
      .post(`/api/v1/inbound-orders/${orderId}/reception-events/${eventId}/approve`)
      .set('Cookie', supervisorCookies)
      .send({ decision: 'APPROVE' });
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.status).toBe('APPROVED');

    expect(infoSpy).toHaveBeenCalledWith(
      'webhook:inventory.stock_adjusted',
      expect.objectContaining({ orderId, eventId, quantity: 5, productId: fixtures.product.id }),
    );
    infoSpy.mockRestore();

    const orderRes = await request(app)
      .get(`/api/v1/inbound-orders/${orderId}`)
      .set('Cookie', supervisorCookies);
    expect(orderRes.body.items[0].receivedQuantity).toBe(15);
    // el pedido se completó automáticamente al quedar totalmente recibido tras la aprobación
    expect(orderRes.body.status).toBe('COMPLETED');

    const inventoryRes = await request(app)
      .get(`/api/v1/inventory?locationId=${fixtures.receiving.id}`)
      .set('Cookie', supervisorCookies);
    expect(inventoryRes.body).toHaveLength(1);
    expect(inventoryRes.body[0].quantity).toBe(15);
  });

  it('REJECT descarta el excedente sin tocar el stock ni lo recibido', async () => {
    const { scanRes, orderId } = await createOrderAndOverScan('OC-OVR-3');
    const eventId = scanRes.body.overReception.pendingEventId;
    const supervisorCookies = await loginAs(app, 'supervisor@test.local');

    const infoSpy = jest.spyOn(logger, 'info');

    const rejectRes = await request(app)
      .post(`/api/v1/inbound-orders/${orderId}/reception-events/${eventId}/approve`)
      .set('Cookie', supervisorCookies)
      .send({ decision: 'REJECT', notes: 'no coincide con el remito del proveedor' });
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.status).toBe('REJECTED');

    // un rechazo no ajusta stock — no debe disparar el webhook de ajuste de inventario
    expect(infoSpy).not.toHaveBeenCalledWith('webhook:inventory.stock_adjusted', expect.anything());
    infoSpy.mockRestore();

    const orderRes = await request(app)
      .get(`/api/v1/inbound-orders/${orderId}`)
      .set('Cookie', supervisorCookies);
    expect(orderRes.body.items[0].receivedQuantity).toBe(10);
    // el excedente era la única ambigüedad pendiente; al rechazarlo, 10/10 esperado queda resuelto
    expect(orderRes.body.status).toBe('COMPLETED');
  });
});
