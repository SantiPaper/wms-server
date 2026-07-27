import request from 'supertest';
import { createApp } from '@/server/app';
import { prisma } from '@/lib/prismadb';
import { resetDb, seedBaseline, loginAs, webhookHeaders } from '@/__tests__/e2e/testUtils';

const app = createApp();

describe('webhook-deliveries: historial y reintento de entregas al ERP', () => {
  let fixtures: Awaited<ReturnType<typeof seedBaseline>>;

  beforeEach(async () => {
    await resetDb();
    fixtures = await seedBaseline();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('OPERARIO recibe 403; SUPERVISOR puede listar', async () => {
    // Cualquier acción que dispare un webhook deja un registro — completar una orden inbound alcanza.
    const inboundOrderRes = await request(app)
      .post('/api/v1/integrations/inbound-orders')
      .set(webhookHeaders())
      .send({
        external_id: 'OC-WHD-1',
        supplier_code: 'SUP-1',
        items: [{ barcode: fixtures.product.barcode, expected_quantity: 5 }],
      });
    const supervisorCookies = await loginAs(app, 'supervisor@test.local');
    await request(app)
      .post(`/api/v1/inbound-orders/${inboundOrderRes.body.id}/scan`)
      .set('Cookie', supervisorCookies)
      .send({ barcode: fixtures.product.barcode, quantityGood: 5 });

    const operarioCookies = await loginAs(app, 'operario@test.local');
    const deniedRes = await request(app).get('/api/v1/webhook-deliveries').set('Cookie', operarioCookies);
    expect(deniedRes.status).toBe(403);

    const listRes = await request(app).get('/api/v1/webhook-deliveries').set('Cookie', supervisorCookies);
    expect(listRes.status).toBe(200);
    expect(listRes.body.total).toBeGreaterThanOrEqual(1);
    expect(listRes.body.items[0].event).toBe('inbound.completed');
    expect(listRes.body.items[0].status).toBe('SENT');
  });

  it('reintentar una entrega que no está FAILED devuelve 409', async () => {
    const supervisorCookies = await loginAs(app, 'supervisor@test.local');
    const delivery = await prisma.webhookDelivery.create({
      data: { event: 'test.sent', payload: { ok: true }, status: 'SENT', attempts: 1 },
    });

    const res = await request(app)
      .post(`/api/v1/webhook-deliveries/${delivery.id}/retry`)
      .set('Cookie', supervisorCookies);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DELIVERY_NOT_FAILED');
  });

  it('reintentar una entrega FAILED la vuelve a intentar (modo stub -> SENT)', async () => {
    const supervisorCookies = await loginAs(app, 'supervisor@test.local');
    const delivery = await prisma.webhookDelivery.create({
      data: { event: 'test.failed', payload: { ok: true }, status: 'FAILED', attempts: 3, lastError: 'timeout viejo' },
    });

    const res = await request(app)
      .post(`/api/v1/webhook-deliveries/${delivery.id}/retry`)
      .set('Cookie', supervisorCookies);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('SENT');
    expect(res.body.lastError).toBeNull();
  });
});
