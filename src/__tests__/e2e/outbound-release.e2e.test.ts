import request from 'supertest';
import { createApp } from '@/server/app';
import { prisma } from '@/lib/prismadb';
import { resetDb, seedBaseline, seedOutboundFixtures, loginAs, webhookHeaders } from '@/__tests__/e2e/testUtils';

const app = createApp();

describe('wave release: allocation engine', () => {
  let outbound: Awaited<ReturnType<typeof seedOutboundFixtures>>;

  beforeEach(async () => {
    await resetDb();
    await seedBaseline();
    outbound = await seedOutboundFixtures();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createOrder(externalOrderId: string, quantity: number) {
    const res = await request(app)
      .post('/api/v1/integrations/outbound-orders')
      .set(webhookHeaders())
      .send({
        external_order_id: externalOrderId,
        customer_name: 'Cliente Test',
        items: [{ barcode: outbound.outProduct.barcode, quantity }],
      });
    return res.body.id as number;
  }

  it('libera una wave con 2 órdenes compartiendo el mismo SKU y ubicación', async () => {
    const supervisorCookies = await loginAs(app, 'supervisor@test.local');
    const order1 = await createOrder('PED-1', 30);
    const order2 = await createOrder('PED-2', 20);

    const releaseRes = await request(app)
      .post('/api/v1/outbound-orders/release')
      .set('Cookie', supervisorCookies)
      .send({ orderIds: [order1, order2] });

    expect(releaseRes.status).toBe(201);
    expect(releaseRes.body.orderIds.sort()).toEqual([order1, order2].sort());
    expect(releaseRes.body.tasks).toHaveLength(2);
    expect(releaseRes.body.tasks.map((t: { requiredQuantity: number }) => t.requiredQuantity).sort()).toEqual([20, 30]);
    releaseRes.body.tasks.forEach((t: { routeSequence: number }, i: number) => expect(t.routeSequence).toBe(i));

    const order1Res = await request(app).get(`/api/v1/outbound-orders/${order1}`).set('Cookie', supervisorCookies);
    expect(order1Res.body.status).toBe('ALLOCATED');
    expect(order1Res.body.items[0].allocatedQuantity).toBe(30);

    const inventoryRes = await request(app)
      .get(`/api/v1/inventory?locationId=${outbound.pickingAisle1.id}`)
      .set('Cookie', supervisorCookies);
    expect(inventoryRes.body[0].allocatedQuantity).toBe(50);
    expect(inventoryRes.body[0].quantity).toBe(100);
  });

  it('rechaza la wave completa si a cualquier item le falta stock, sin dejar cambios parciales', async () => {
    const supervisorCookies = await loginAs(app, 'supervisor@test.local');
    const order1 = await createOrder('PED-3', 30);
    const order2 = await createOrder('PED-4', 9999);

    const releaseRes = await request(app)
      .post('/api/v1/outbound-orders/release')
      .set('Cookie', supervisorCookies)
      .send({ orderIds: [order1, order2] });

    expect(releaseRes.status).toBe(422);
    expect(releaseRes.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(releaseRes.body.error.details.shortfalls).toHaveLength(1);
    // order1 (30) is processed first within the same wave and virtually reserves its share of the
    // 100 available first, leaving only 70 for order2 before the shortfall is computed.
    expect(releaseRes.body.error.details.shortfalls[0].missingQty).toBe(9999 - 70);

    const order1Res = await request(app).get(`/api/v1/outbound-orders/${order1}`).set('Cookie', supervisorCookies);
    expect(order1Res.body.status).toBe('CREATED');
    expect(order1Res.body.items[0].allocatedQuantity).toBe(0);

    const inventoryRes = await request(app)
      .get(`/api/v1/inventory?locationId=${outbound.pickingAisle1.id}`)
      .set('Cookie', supervisorCookies);
    expect(inventoryRes.body[0].allocatedQuantity).toBe(0);
  });

  it('requiere rol SUPERVISOR/ADMIN para liberar', async () => {
    const operarioCookies = await loginAs(app, 'operario@test.local');
    const order1 = await createOrder('PED-5', 10);
    const res = await request(app)
      .post('/api/v1/outbound-orders/release')
      .set('Cookie', operarioCookies)
      .send({ orderIds: [order1] });
    expect(res.status).toBe(403);
  });
});
