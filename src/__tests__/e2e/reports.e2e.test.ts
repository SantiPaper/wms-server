import request from 'supertest';
import { createApp } from '@/server/app';
import { prisma } from '@/lib/prismadb';
import { resetDb, seedBaseline, seedOutboundFixtures, loginAs, webhookHeaders } from '@/__tests__/e2e/testUtils';

const app = createApp();

describe('reportes', () => {
  let fixtures: Awaited<ReturnType<typeof seedBaseline>>;
  let outbound: Awaited<ReturnType<typeof seedOutboundFixtures>>;
  let supervisorCookies: string[];

  beforeEach(async () => {
    await resetDb();
    fixtures = await seedBaseline();
    outbound = await seedOutboundFixtures();
    supervisorCookies = await loginAs(app, 'supervisor@test.local');
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('OPERARIO recibe 403 en los cuatro endpoints de reportes', async () => {
    const operarioCookies = await loginAs(app, 'operario@test.local');
    for (const path of ['pending-approvals', 'discrepancies', 'inventory-summary', 'throughput']) {
      const res = await request(app).get(`/api/v1/reports/${path}`).set('Cookie', operarioCookies);
      expect(res.status).toBe(403);
    }
  });

  it('pending-approvals muestra la sobre-recepción y la tarea con faltante', async () => {
    // Sobre-recepción: escanear más de lo esperado deja un ReceptionEvent PENDING_APPROVAL.
    const inboundOrderRes = await request(app)
      .post('/api/v1/integrations/inbound-orders')
      .set(webhookHeaders())
      .send({
        external_id: 'OC-REPORT-1',
        supplier_code: 'SUP-1',
        items: [{ barcode: fixtures.product.barcode, expected_quantity: 10 }],
      });
    await request(app)
      .post(`/api/v1/inbound-orders/${inboundOrderRes.body.id}/scan`)
      .set('Cookie', supervisorCookies)
      .send({ barcode: fixtures.product.barcode, quantityGood: 15 });

    // Falta sin alternativa: única ubicación con ese producto+lote -> queda en SHORTAGE.
    const outboundOrderRes = await request(app)
      .post('/api/v1/integrations/outbound-orders')
      .set(webhookHeaders())
      .send({ external_order_id: 'PED-REPORT-1', items: [{ barcode: outbound.outBatchProduct.barcode, quantity: 20 }] });
    const releaseRes = await request(app)
      .post('/api/v1/outbound-orders/release')
      .set('Cookie', supervisorCookies)
      .send({ orderIds: [outboundOrderRes.body.id] });
    const task = releaseRes.body.tasks[0];
    await request(app)
      .post(`/api/v1/outbound-orders/${outboundOrderRes.body.id}/picking-tasks/${task.id}/report-shortage`)
      .set('Cookie', supervisorCookies)
      .send({ locationCode: outbound.reserveAisle1.locationCode, quantityFound: 0 });

    const res = await request(app).get('/api/v1/reports/pending-approvals').set('Cookie', supervisorCookies);
    expect(res.status).toBe(200);
    expect(res.body.pendingReceptionEvents.count).toBe(1);
    expect(res.body.pendingReceptionEvents.items[0].quantity).toBe(5);
    expect(res.body.shortageTasks.count).toBe(1);
    expect(res.body.shortageTasks.items[0].id).toBe(task.id);
  });

  it('discrepancies muestra la ubicación fantasma dejada por un faltante sin alternativa', async () => {
    const outboundOrderRes = await request(app)
      .post('/api/v1/integrations/outbound-orders')
      .set(webhookHeaders())
      .send({ external_order_id: 'PED-REPORT-2', items: [{ barcode: outbound.outBatchProduct.barcode, quantity: 20 }] });
    const releaseRes = await request(app)
      .post('/api/v1/outbound-orders/release')
      .set('Cookie', supervisorCookies)
      .send({ orderIds: [outboundOrderRes.body.id] });
    const task = releaseRes.body.tasks[0];
    await request(app)
      .post(`/api/v1/outbound-orders/${outboundOrderRes.body.id}/picking-tasks/${task.id}/report-shortage`)
      .set('Cookie', supervisorCookies)
      .send({ locationCode: outbound.reserveAisle1.locationCode, quantityFound: 0 });

    const res = await request(app).get('/api/v1/reports/discrepancies').set('Cookie', supervisorCookies);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.items[0].location.locationCode).toBe(outbound.reserveAisle1.locationCode);
    expect(res.body.items[0].status).toBe('DISCREPANCY');
  });

  it('inventory-summary reconcilia el total entre el desglose por status y por zona', async () => {
    const res = await request(app).get('/api/v1/reports/inventory-summary').set('Cookie', supervisorCookies);
    expect(res.status).toBe(200);
    const totalByStatus = res.body.byStatus.reduce((sum: number, r: { quantity: number }) => sum + r.quantity, 0);
    const totalByZone = res.body.byZoneType.reduce((sum: number, r: { quantity: number }) => sum + r.quantity, 0);
    expect(totalByStatus).toBeGreaterThan(0);
    expect(totalByStatus).toBe(totalByZone);
  });

  it('throughput cuenta inbound completados y outbound despachados, respetando ?since', async () => {
    const inboundOrderRes = await request(app)
      .post('/api/v1/integrations/inbound-orders')
      .set(webhookHeaders())
      .send({
        external_id: 'OC-REPORT-3',
        supplier_code: 'SUP-1',
        items: [{ barcode: fixtures.product.barcode, expected_quantity: 5 }],
      });
    await request(app)
      .post(`/api/v1/inbound-orders/${inboundOrderRes.body.id}/scan`)
      .set('Cookie', supervisorCookies)
      .send({ barcode: fixtures.product.barcode, quantityGood: 5 });

    const outboundOrderRes = await request(app)
      .post('/api/v1/integrations/outbound-orders')
      .set(webhookHeaders())
      .send({ external_order_id: 'PED-REPORT-3', items: [{ barcode: outbound.outProduct.barcode, quantity: 10 }] });
    const releaseRes = await request(app)
      .post('/api/v1/outbound-orders/release')
      .set('Cookie', supervisorCookies)
      .send({ orderIds: [outboundOrderRes.body.id] });
    const task = releaseRes.body.tasks[0];
    await request(app)
      .post(`/api/v1/outbound-orders/${outboundOrderRes.body.id}/picking-tasks/${task.id}/scan`)
      .set('Cookie', supervisorCookies)
      .send({ locationCode: outbound.pickingAisle1.locationCode, barcode: outbound.outProduct.barcode });
    await request(app)
      .post(`/api/v1/outbound-orders/${outboundOrderRes.body.id}/pack`)
      .set('Cookie', supervisorCookies)
      .send({});
    await request(app)
      .post(`/api/v1/outbound-orders/${outboundOrderRes.body.id}/ship`)
      .set('Cookie', supervisorCookies)
      .send({});

    const res = await request(app).get('/api/v1/reports/throughput').set('Cookie', supervisorCookies);
    expect(res.status).toBe(200);
    expect(res.body.inboundCompleted).toBe(1);
    expect(res.body.outboundShipped).toBe(1);

    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const futureRes = await request(app)
      .get(`/api/v1/reports/throughput?since=${future}`)
      .set('Cookie', supervisorCookies);
    expect(futureRes.body.inboundCompleted).toBe(0);
    expect(futureRes.body.outboundShipped).toBe(0);
  });
});
