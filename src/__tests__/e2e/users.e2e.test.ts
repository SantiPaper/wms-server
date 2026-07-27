import request from 'supertest';
import { createApp } from '@/server/app';
import { prisma } from '@/lib/prismadb';
import { resetDb, seedBaseline, loginAs, TEST_PASSWORD } from '@/__tests__/e2e/testUtils';

const app = createApp();

describe('users (ABM)', () => {
  let fixtures: Awaited<ReturnType<typeof seedBaseline>>;

  beforeEach(async () => {
    await resetDb();
    fixtures = await seedBaseline();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('ADMIN crea un usuario sin exponer el hash de la contraseña', async () => {
    const adminCookies = await loginAs(app, 'admin@test.local');
    const res = await request(app)
      .post('/api/v1/users')
      .set('Cookie', adminCookies)
      .send({ email: 'nuevo@test.local', password: 'password123', role: 'OPERARIO' });
    expect(res.status).toBe(201);
    expect(res.body.email).toBe('nuevo@test.local');
    expect(res.body.passwordHash).toBeUndefined();
    expect(res.body.isActive).toBe(true);
  });

  it('rechaza un email duplicado con 409', async () => {
    const adminCookies = await loginAs(app, 'admin@test.local');
    const res = await request(app)
      .post('/api/v1/users')
      .set('Cookie', adminCookies)
      .send({ email: 'admin@test.local', password: 'password123', role: 'OPERARIO' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('UNIQUE_CONSTRAINT');
  });

  it('SUPERVISOR puede listar y ver usuarios pero no crearlos ni editarlos', async () => {
    const supervisorCookies = await loginAs(app, 'supervisor@test.local');
    const listRes = await request(app).get('/api/v1/users').set('Cookie', supervisorCookies);
    expect(listRes.status).toBe(200);

    const getRes = await request(app).get(`/api/v1/users/${fixtures.operario.id}`).set('Cookie', supervisorCookies);
    expect(getRes.status).toBe(200);

    const createRes = await request(app)
      .post('/api/v1/users')
      .set('Cookie', supervisorCookies)
      .send({ email: 'otro@test.local', password: 'password123', role: 'OPERARIO' });
    expect(createRes.status).toBe(403);

    const patchRes = await request(app)
      .patch(`/api/v1/users/${fixtures.operario.id}`)
      .set('Cookie', supervisorCookies)
      .send({ role: 'SUPERVISOR' });
    expect(patchRes.status).toBe(403);
  });

  it('OPERARIO no puede listar usuarios', async () => {
    const operarioCookies = await loginAs(app, 'operario@test.local');
    const res = await request(app).get('/api/v1/users').set('Cookie', operarioCookies);
    expect(res.status).toBe(403);
  });

  it('ADMIN puede cambiar el rol y desactivar a otro usuario', async () => {
    const adminCookies = await loginAs(app, 'admin@test.local');
    const res = await request(app)
      .patch(`/api/v1/users/${fixtures.operario.id}`)
      .set('Cookie', adminCookies)
      .send({ role: 'SUPERVISOR', isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('SUPERVISOR');
    expect(res.body.isActive).toBe(false);
  });

  it('un ADMIN no puede desactivar su propia cuenta', async () => {
    const adminCookies = await loginAs(app, 'admin@test.local');
    const res = await request(app)
      .patch(`/api/v1/users/${fixtures.admin.id}`)
      .set('Cookie', adminCookies)
      .send({ isActive: false });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SELF_LOCKOUT');
  });

  it('un usuario desactivado por ADMIN ya no puede loguearse', async () => {
    const adminCookies = await loginAs(app, 'admin@test.local');
    await request(app)
      .patch(`/api/v1/users/${fixtures.operario.id}`)
      .set('Cookie', adminCookies)
      .send({ isActive: false });

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'operario@test.local', password: TEST_PASSWORD });
    expect(loginRes.status).toBe(401);
  });
});
