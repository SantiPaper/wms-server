import request from 'supertest';
import { createApp } from '@/server/app';
import { prisma } from '@/lib/prismadb';
import { resetDb, seedBaseline, loginAs, TEST_PASSWORD } from '@/__tests__/e2e/testUtils';

const app = createApp();

describe('auth + role gating', () => {
  beforeEach(async () => {
    await resetDb();
    await seedBaseline();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejects login with wrong password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@test.local', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('logs in each seeded role successfully', async () => {
    for (const email of ['admin@test.local', 'supervisor@test.local', 'operario@test.local']) {
      const res = await request(app).post('/api/v1/auth/login').send({ email, password: TEST_PASSWORD });
      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe(email);
    }
  });

  it('blocks OPERARIO from creating a location (ADMIN/SUPERVISOR only)', async () => {
    const cookies = await loginAs(app, 'operario@test.local');
    const res = await request(app)
      .post('/api/v1/locations')
      .set('Cookie', cookies)
      .send({ locationCode: 'NEW-01', zoneType: 'STORAGE_RESERVE' });
    expect(res.status).toBe(403);
  });

  it('allows SUPERVISOR to create a location', async () => {
    const cookies = await loginAs(app, 'supervisor@test.local');
    const res = await request(app)
      .post('/api/v1/locations')
      .set('Cookie', cookies)
      .send({ locationCode: 'NEW-01', zoneType: 'STORAGE_RESERVE' });
    expect(res.status).toBe(201);
  });

  it('rejects unauthenticated access to protected routes', async () => {
    const res = await request(app).get('/api/v1/products');
    expect(res.status).toBe(401);
  });

  it('rejects login for a deactivated user with the same generic error as a wrong password', async () => {
    await prisma.user.update({ where: { email: 'operario@test.local' }, data: { isActive: false } });
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'operario@test.local', password: TEST_PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('GET /auth/me without a cookie is unauthenticated', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('GET /auth/me with a valid cookie returns the logged-in user', async () => {
    const cookies = await loginAs(app, 'supervisor@test.local');
    const res = await request(app).get('/api/v1/auth/me').set('Cookie', cookies);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: 'supervisor@test.local', role: 'SUPERVISOR' });
  });

  it('deactivating a user mid-session invalidates /auth/me even with a still-valid access token', async () => {
    const cookies = await loginAs(app, 'operario@test.local');
    const stillWorks = await request(app).get('/api/v1/auth/me').set('Cookie', cookies);
    expect(stillWorks.status).toBe(200);

    await prisma.user.update({ where: { email: 'operario@test.local' }, data: { isActive: false } });

    const nowBlocked = await request(app).get('/api/v1/auth/me').set('Cookie', cookies);
    expect(nowBlocked.status).toBe(401);
  });
});
