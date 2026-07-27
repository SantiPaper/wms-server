import request from 'supertest';
import { createApp } from '@/server/app';
import { prisma } from '@/lib/prismadb';
import { resetDb, seedBaseline, loginAs, webhookHeaders } from '@/__tests__/e2e/testUtils';

const app = createApp();

describe('mercadería dañada en recepción', () => {
  let fixtures: Awaited<ReturnType<typeof seedBaseline>>;

  beforeEach(async () => {
    await resetDb();
    fixtures = await seedBaseline();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('enruta las unidades dañadas a cuarentena y deja visible la discrepancia vs. lo esperado', async () => {
    const operarioCookies = await loginAs(app, 'operario@test.local');

    const createRes = await request(app)
      .post('/api/v1/integrations/inbound-orders')
      .set(webhookHeaders())
      .send({
        external_id: 'OC-DMG-1',
        supplier_code: 'SUP-1',
        items: [{ barcode: fixtures.product.barcode, expected_quantity: 10 }],
      });
    const orderId = createRes.body.id;

    const scanRes = await request(app)
      .post(`/api/v1/inbound-orders/${orderId}/scan`)
      .set('Cookie', operarioCookies)
      .send({ barcode: fixtures.product.barcode, quantityGood: 7, quantityDamaged: 3 });

    expect(scanRes.status).toBe(200);
    expect(scanRes.body.receivedQuantityTotal).toBe(7);
    expect(scanRes.body.damagedQuantityTotal).toBe(3);
    expect(scanRes.body.expectedQuantity).toBe(10);
    expect(scanRes.body.damagedLpn.status).toBe('IN_STOCK');
    // no se autocompleta: quedan 3 unidades de discrepancia que nunca llegarán como "buenas"
    expect(scanRes.body.orderStatus).toBe('IN_RECEIVING');

    const damagedInventory = await request(app)
      .get(`/api/v1/inventory?status=DAMAGED`)
      .set('Cookie', operarioCookies);
    expect(damagedInventory.body).toHaveLength(1);
    expect(damagedInventory.body[0].quantity).toBe(3);
    expect(damagedInventory.body[0].location.locationCode).toBe(fixtures.quarantine.locationCode);

    const goodInventory = await request(app)
      .get(`/api/v1/inventory?locationId=${fixtures.receiving.id}`)
      .set('Cookie', operarioCookies);
    expect(goodInventory.body).toHaveLength(1);
    expect(goodInventory.body[0].quantity).toBe(7);
    expect(goodInventory.body[0].status).toBe('AVAILABLE');

    const supervisorCookies = await loginAs(app, 'supervisor@test.local');
    const completeRes = await request(app)
      .patch(`/api/v1/inbound-orders/${orderId}/complete`)
      .set('Cookie', supervisorCookies)
      .send({ reason: '3 unidades dañadas, no se esperan más' });
    expect(completeRes.status).toBe(200);
  });

  it('rechaza una LPN dañada en el flujo de putaway', async () => {
    const operarioCookies = await loginAs(app, 'operario@test.local');
    const createRes = await request(app)
      .post('/api/v1/integrations/inbound-orders')
      .set(webhookHeaders())
      .send({
        external_id: 'OC-DMG-2',
        supplier_code: 'SUP-1',
        items: [{ barcode: fixtures.product.barcode, expected_quantity: 5 }],
      });
    const orderId = createRes.body.id;

    const scanRes = await request(app)
      .post(`/api/v1/inbound-orders/${orderId}/scan`)
      .set('Cookie', operarioCookies)
      .send({ barcode: fixtures.product.barcode, quantityDamaged: 5 });

    const damagedLpnCode = scanRes.body.damagedLpn.code;

    const suggestionRes = await request(app)
      .get(`/api/v1/lpns/${damagedLpnCode}/putaway-suggestion`)
      .set('Cookie', operarioCookies);
    expect(suggestionRes.status).toBe(400);
    expect(suggestionRes.body.error.code).toBe('DAMAGED_LPN_PUTAWAY');
  });
});
