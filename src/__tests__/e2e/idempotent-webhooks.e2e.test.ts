import request from 'supertest';
import { createApp } from '@/server/app';
import { prisma } from '@/lib/prismadb';
import { resetDb, seedBaseline, seedOutboundFixtures, webhookHeaders } from '@/__tests__/e2e/testUtils';

const app = createApp();

describe('webhooks entrantes son idempotentes (reenvío del mismo external_id)', () => {
  let fixtures: Awaited<ReturnType<typeof seedBaseline>>;
  let outbound: Awaited<ReturnType<typeof seedOutboundFixtures>>;

  beforeEach(async () => {
    await resetDb();
    fixtures = await seedBaseline();
    outbound = await seedOutboundFixtures();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('inbound: reenviar el mismo external_id devuelve la misma orden (200) sin duplicar', async () => {
    const payload = {
      external_id: 'OC-IDEMPOTENT-1',
      supplier_code: 'SUP-1',
      items: [{ barcode: fixtures.product.barcode, expected_quantity: 10 }],
    };

    const first = await request(app).post('/api/v1/integrations/inbound-orders').set(webhookHeaders()).send(payload);
    expect(first.status).toBe(201);

    const second = await request(app).post('/api/v1/integrations/inbound-orders').set(webhookHeaders()).send(payload);
    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);

    const count = await prisma.inboundOrder.count({ where: { externalId: payload.external_id } });
    expect(count).toBe(1);
  });

  it('outbound: reenviar el mismo external_order_id devuelve la misma orden (200) sin duplicar', async () => {
    const payload = {
      external_order_id: 'PED-IDEMPOTENT-1',
      items: [{ barcode: outbound.outProduct.barcode, quantity: 2 }],
    };

    const first = await request(app).post('/api/v1/integrations/outbound-orders').set(webhookHeaders()).send(payload);
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/v1/integrations/outbound-orders')
      .set(webhookHeaders())
      .send(payload);
    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);

    const count = await prisma.outboundOrder.count({ where: { orderNumber: payload.external_order_id } });
    expect(count).toBe(1);
  });
});
