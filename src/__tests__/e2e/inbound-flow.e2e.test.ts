import request from 'supertest';
import { createApp } from '@/server/app';
import { prisma } from '@/lib/prismadb';
import { resetDb, seedBaseline, loginAs, webhookHeaders } from '@/__tests__/e2e/testUtils';

const app = createApp();

describe('inbound flow: recepción -> completado -> putaway', () => {
  let fixtures: Awaited<ReturnType<typeof seedBaseline>>;

  beforeEach(async () => {
    await resetDb();
    fixtures = await seedBaseline();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('recibe una orden completa, la autocompleta y permite hacer putaway a la ubicación de categoría', async () => {
    const operarioCookies = await loginAs(app, 'operario@test.local');

    const createRes = await request(app)
      .post('/api/v1/integrations/inbound-orders')
      .set(webhookHeaders())
      .send({
        external_id: 'OC-1001',
        supplier_code: 'SUP-1',
        items: [{ barcode: fixtures.product.barcode, expected_quantity: 10 }],
      });
    expect(createRes.status).toBe(201);
    const orderId = createRes.body.id;

    const listRes = await request(app).get('/api/v1/inbound-orders').set('Cookie', operarioCookies);
    expect(listRes.status).toBe(200);
    expect(listRes.body.some((o: { id: number }) => o.id === orderId)).toBe(true);

    const scanRes = await request(app)
      .post(`/api/v1/inbound-orders/${orderId}/scan`)
      .set('Cookie', operarioCookies)
      .send({ barcode: fixtures.product.barcode, quantityGood: 10 });
    expect(scanRes.status).toBe(200);
    expect(scanRes.body.receivedQuantityTotal).toBe(10);
    expect(scanRes.body.overReception.triggered).toBe(false);
    expect(scanRes.body.orderStatus).toBe('COMPLETED');

    const lpnCode = scanRes.body.lpn.code;

    const doubleComplete = await request(app)
      .patch(`/api/v1/inbound-orders/${orderId}/complete`)
      .set('Cookie', await loginAs(app, 'supervisor@test.local'))
      .send({});
    expect(doubleComplete.status).toBe(409);

    const suggestionRes = await request(app)
      .get(`/api/v1/lpns/${lpnCode}/putaway-suggestion`)
      .set('Cookie', operarioCookies);
    expect(suggestionRes.status).toBe(200);
    expect(suggestionRes.body.reason).toBe('CATEGORY');
    expect(suggestionRes.body.locationCode).toBe(fixtures.storage1.locationCode);

    const confirmRes = await request(app)
      .post(`/api/v1/lpns/${lpnCode}/putaway/confirm`)
      .set('Cookie', operarioCookies)
      .send({ locationCode: fixtures.storage1.locationCode });
    expect(confirmRes.status).toBe(200);

    const inventoryInStorage = await request(app)
      .get(`/api/v1/inventory?locationId=${fixtures.storage1.id}`)
      .set('Cookie', operarioCookies);
    expect(inventoryInStorage.body).toHaveLength(1);
    expect(inventoryInStorage.body[0].quantity).toBe(10);
    expect(inventoryInStorage.body[0].status).toBe('AVAILABLE');

    const inventoryInReceiving = await request(app)
      .get(`/api/v1/inventory?locationId=${fixtures.receiving.id}`)
      .set('Cookie', operarioCookies);
    expect(inventoryInReceiving.body).toHaveLength(0);
  });

  it('permite cerrar manualmente una orden parcialmente recibida', async () => {
    const supervisorCookies = await loginAs(app, 'supervisor@test.local');

    const createRes = await request(app)
      .post('/api/v1/integrations/inbound-orders')
      .set(webhookHeaders())
      .send({
        external_id: 'OC-1002',
        supplier_code: 'SUP-1',
        items: [{ barcode: fixtures.product.barcode, expected_quantity: 10 }],
      });
    const orderId = createRes.body.id;

    await request(app)
      .post(`/api/v1/inbound-orders/${orderId}/scan`)
      .set('Cookie', supervisorCookies)
      .send({ barcode: fixtures.product.barcode, quantityGood: 4 });

    const completeRes = await request(app)
      .patch(`/api/v1/inbound-orders/${orderId}/complete`)
      .set('Cookie', supervisorCookies)
      .send({ reason: 'cierre manual por faltante de proveedor' });
    expect(completeRes.status).toBe(200);
    expect(completeRes.body.status).toBe('COMPLETED');

    const scanAfterComplete = await request(app)
      .post(`/api/v1/inbound-orders/${orderId}/scan`)
      .set('Cookie', supervisorCookies)
      .send({ barcode: fixtures.product.barcode, quantityGood: 1 });
    expect(scanAfterComplete.status).toBe(409);
  });
});
