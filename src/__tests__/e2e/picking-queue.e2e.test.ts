import request from 'supertest';
import { createApp } from '@/server/app';
import { prisma } from '@/lib/prismadb';
import { hashPassword } from '@/modules/auth/password.util';
import { resetDb, seedBaseline, seedOutboundFixtures, loginAs, webhookHeaders, TEST_PASSWORD } from '@/__tests__/e2e/testUtils';

const app = createApp();

describe('cola de picking (claim-next) para la PWA de colectoras', () => {
  let outbound: Awaited<ReturnType<typeof seedOutboundFixtures>>;

  beforeEach(async () => {
    await resetDb();
    await seedBaseline();
    outbound = await seedOutboundFixtures();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('devuelve 204 cuando no hay tareas disponibles', async () => {
    const cookies = await loginAs(app, 'operario@test.local');
    const res = await request(app).post('/api/v1/picking-tasks/claim-next').set('Cookie', cookies);
    expect(res.status).toBe(204);
  });

  it('es idempotente: pedir de nuevo sin completar devuelve la misma tarea ya asignada', async () => {
    const supervisorCookies = await loginAs(app, 'supervisor@test.local');
    const operarioCookies = await loginAs(app, 'operario@test.local');

    const createRes = await request(app)
      .post('/api/v1/integrations/outbound-orders')
      .set(webhookHeaders())
      .send({ external_order_id: 'PED-QUEUE-1', items: [{ barcode: outbound.outProduct.barcode, quantity: 5 }] });
    await request(app)
      .post('/api/v1/outbound-orders/release')
      .set('Cookie', supervisorCookies)
      .send({ orderIds: [createRes.body.id] });

    const first = await request(app).post('/api/v1/picking-tasks/claim-next').set('Cookie', operarioCookies);
    expect(first.status).toBe(200);
    expect(first.body.status).toBe('IN_PROGRESS');
    expect(first.body.assignedUserId).not.toBeNull();

    const second = await request(app).post('/api/v1/picking-tasks/claim-next').set('Cookie', operarioCookies);
    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);
  });

  it('dos operarios reclamando en paralelo nunca se llevan la misma tarea', async () => {
    const supervisorCookies = await loginAs(app, 'supervisor@test.local');
    const passwordHash = await hashPassword(TEST_PASSWORD);
    await prisma.user.create({ data: { email: 'operario2@test.local', passwordHash, role: 'OPERARIO' } });

    const createOrder1 = await request(app)
      .post('/api/v1/integrations/outbound-orders')
      .set(webhookHeaders())
      .send({ external_order_id: 'PED-QUEUE-2A', items: [{ barcode: outbound.outProduct.barcode, quantity: 5 }] });
    const createOrder2 = await request(app)
      .post('/api/v1/integrations/outbound-orders')
      .set(webhookHeaders())
      .send({ external_order_id: 'PED-QUEUE-2B', items: [{ barcode: outbound.outBatchProduct.barcode, quantity: 5 }] });

    const releaseRes = await request(app)
      .post('/api/v1/outbound-orders/release')
      .set('Cookie', supervisorCookies)
      .send({ orderIds: [createOrder1.body.id, createOrder2.body.id] });
    expect(releaseRes.body.tasks).toHaveLength(2);

    const [cookiesA, cookiesB] = await Promise.all([
      loginAs(app, 'operario@test.local'),
      loginAs(app, 'operario2@test.local'),
    ]);

    const [resA, resB] = await Promise.all([
      request(app).post('/api/v1/picking-tasks/claim-next').set('Cookie', cookiesA),
      request(app).post('/api/v1/picking-tasks/claim-next').set('Cookie', cookiesB),
    ]);

    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    expect(resA.body.id).not.toBe(resB.body.id);

    const remaining = await request(app).post('/api/v1/picking-tasks/claim-next').set('Cookie', supervisorCookies);
    expect(remaining.status).toBe(204);
  });

  it('assignedUserId persiste después de completar el scan de la tarea', async () => {
    const supervisorCookies = await loginAs(app, 'supervisor@test.local');
    const operarioCookies = await loginAs(app, 'operario@test.local');

    const createRes = await request(app)
      .post('/api/v1/integrations/outbound-orders')
      .set(webhookHeaders())
      .send({ external_order_id: 'PED-QUEUE-3', items: [{ barcode: outbound.outProduct.barcode, quantity: 5 }] });
    const orderId = createRes.body.id;
    await request(app)
      .post('/api/v1/outbound-orders/release')
      .set('Cookie', supervisorCookies)
      .send({ orderIds: [orderId] });

    const claimed = await request(app).post('/api/v1/picking-tasks/claim-next').set('Cookie', operarioCookies);
    const taskId = claimed.body.id;

    const scanRes = await request(app)
      .post(`/api/v1/outbound-orders/${orderId}/picking-tasks/${taskId}/scan`)
      .set('Cookie', operarioCookies)
      .send({ locationCode: outbound.pickingAisle1.locationCode, barcode: outbound.outProduct.barcode });
    expect(scanRes.status).toBe(200);
    expect(scanRes.body.status).toBe('COMPLETED');

    const tasksRes = await request(app)
      .get(`/api/v1/outbound-orders/${orderId}/picking-tasks`)
      .set('Cookie', supervisorCookies);
    expect(tasksRes.body[0].assignedUserId).toBe(claimed.body.assignedUserId);
  });
});
