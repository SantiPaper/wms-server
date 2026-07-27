import request from 'supertest';
import { createApp } from '@/server/app';
import { prisma } from '@/lib/prismadb';
import { resetDb, seedBaseline, loginAs, webhookHeaders } from '@/__tests__/e2e/testUtils';

const app = createApp();

describe('putaway: consolidación vs. categoría/rotación', () => {
  let fixtures: Awaited<ReturnType<typeof seedBaseline>>;

  beforeEach(async () => {
    await resetDb();
    fixtures = await seedBaseline();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rotationClass A sin consolidación prefiere la zona PICKING_ACTIVE', async () => {
    const operarioCookies = await loginAs(app, 'operario@test.local');

    const createRes = await request(app)
      .post('/api/v1/integrations/inbound-orders')
      .set(webhookHeaders())
      .send({
        external_id: 'OC-PUT-1',
        supplier_code: 'SUP-1',
        items: [{ barcode: fixtures.batchProduct.barcode, expected_quantity: 5 }],
      });
    const orderId = createRes.body.id;

    const scanRes = await request(app)
      .post(`/api/v1/inbound-orders/${orderId}/scan`)
      .set('Cookie', operarioCookies)
      .send({
        barcode: fixtures.batchProduct.barcode,
        quantityGood: 5,
        batchNumber: 'L-2026-A',
        expirationDate: '2027-01-01',
      });

    const suggestionRes = await request(app)
      .get(`/api/v1/lpns/${scanRes.body.lpn.code}/putaway-suggestion`)
      .set('Cookie', operarioCookies);

    expect(suggestionRes.status).toBe(200);
    expect(suggestionRes.body.reason).toBe('CATEGORY');
    expect(suggestionRes.body.locationCode).toBe(fixtures.pickingActive.locationCode);
  });

  it('prioriza consolidar en una ubicación con el mismo producto+lote por sobre la categoría', async () => {
    const operarioCookies = await loginAs(app, 'operario@test.local');

    // Stock preexistente del mismo producto+lote ya guardado en STO-02.
    const existingLpn = await prisma.lpn.create({
      data: { lpnCode: 'LPN-EXIST-1', currentLocationId: fixtures.storage2.id },
    });
    await prisma.inventory.create({
      data: {
        productId: fixtures.batchProduct.id,
        locationId: fixtures.storage2.id,
        lpnId: existingLpn.id,
        batchNumber: 'L-2026-A',
        expirationDate: new Date('2027-01-01'),
        quantity: 20,
        status: 'AVAILABLE',
      },
    });

    const createRes = await request(app)
      .post('/api/v1/integrations/inbound-orders')
      .set(webhookHeaders())
      .send({
        external_id: 'OC-PUT-2',
        supplier_code: 'SUP-1',
        items: [{ barcode: fixtures.batchProduct.barcode, expected_quantity: 5 }],
      });
    const orderId = createRes.body.id;

    const scanRes = await request(app)
      .post(`/api/v1/inbound-orders/${orderId}/scan`)
      .set('Cookie', operarioCookies)
      .send({
        barcode: fixtures.batchProduct.barcode,
        quantityGood: 5,
        batchNumber: 'L-2026-A',
        expirationDate: '2027-01-01',
      });

    const suggestionRes = await request(app)
      .get(`/api/v1/lpns/${scanRes.body.lpn.code}/putaway-suggestion`)
      .set('Cookie', operarioCookies);

    expect(suggestionRes.status).toBe(200);
    expect(suggestionRes.body.reason).toBe('CONSOLIDATION');
    expect(suggestionRes.body.locationCode).toBe(fixtures.storage2.locationCode);
  });

  it('devuelve 422 NO_LOCATION_AVAILABLE cuando todas las ubicaciones de destino están bloqueadas', async () => {
    const operarioCookies = await loginAs(app, 'operario@test.local');
    await prisma.location.updateMany({ where: {}, data: { isBlocked: true } });
    await prisma.location.update({ where: { id: fixtures.receiving.id }, data: { isBlocked: false } });

    const createRes = await request(app)
      .post('/api/v1/integrations/inbound-orders')
      .set(webhookHeaders())
      .send({
        external_id: 'OC-PUT-3',
        supplier_code: 'SUP-1',
        items: [{ barcode: fixtures.product.barcode, expected_quantity: 5 }],
      });
    const orderId = createRes.body.id;

    const scanRes = await request(app)
      .post(`/api/v1/inbound-orders/${orderId}/scan`)
      .set('Cookie', operarioCookies)
      .send({ barcode: fixtures.product.barcode, quantityGood: 5 });

    const suggestionRes = await request(app)
      .get(`/api/v1/lpns/${scanRes.body.lpn.code}/putaway-suggestion`)
      .set('Cookie', operarioCookies);

    expect(suggestionRes.status).toBe(422);
    expect(suggestionRes.body.error.code).toBe('NO_LOCATION_AVAILABLE');
  });
});
