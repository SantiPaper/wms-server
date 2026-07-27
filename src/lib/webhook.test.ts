import { prisma } from '@/lib/prismadb';

jest.mock('@/lib/env', () => {
  const actual = jest.requireActual('@/lib/env');
  return {
    env: {
      ...actual.env,
      ERP_WEBHOOK_URL: 'http://mock-erp.test/webhook',
      ERP_WEBHOOK_MAX_RETRIES: 3,
      ERP_WEBHOOK_TIMEOUT_MS: 1000,
    },
  };
});

// Importado después del mock de env para que webhook.ts lea la versión mockeada.
import { sendWebhook, BACKOFF_MS } from '@/lib/webhook';

// Backoff real pero achicado a milisegundos chicos — evita esperar 42s reales (2s+10s+30s) por
// test mientras sigue ejercitando el mecanismo real de reintento con setTimeout, sin el riesgo de
// mezclar fake timers de Jest con la I/O real de Postgres (esa combinación es frágil: los
// timers fake no garantizan que una promesa de red/DB no relacionada con un timer se resuelva).
const ORIGINAL_BACKOFF = [...BACKOFF_MS];
beforeAll(() => {
  BACKOFF_MS.splice(0, BACKOFF_MS.length, 10, 20, 30);
});
afterAll(async () => {
  BACKOFF_MS.splice(0, BACKOFF_MS.length, ...ORIGINAL_BACKOFF);
  await prisma.$disconnect();
});

async function waitForSettled(event: string, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const delivery = await prisma.webhookDelivery.findFirstOrThrow({ where: { event }, orderBy: { id: 'desc' } });
    if (delivery.status !== 'PENDING') return delivery;
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  throw new Error(`webhook delivery for "${event}" nunca salió de PENDING dentro de ${timeoutMs}ms`);
}

describe('sendWebhook: reintentos con backoff (ERP_WEBHOOK_URL configurada)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('marca SENT al primer intento si el POST responde ok', async () => {
    const event = `test.first-try-${Date.now()}`;
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));

    await sendWebhook(event, { hello: 'world' });
    const delivery = await waitForSettled(event);

    expect(delivery.status).toBe('SENT');
    expect(delivery.attempts).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reintenta con backoff y termina en SENT si un intento posterior funciona', async () => {
    const event = `test.retry-then-ok-${Date.now()}`;
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    await sendWebhook(event, { hello: 'world' });
    const delivery = await waitForSettled(event);

    expect(delivery.status).toBe('SENT');
    expect(delivery.attempts).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('agota los reintentos y queda FAILED con el último error', async () => {
    const event = `test.exhausted-${Date.now()}`;
    const fetchMock = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ERP caído'));

    await sendWebhook(event, { hello: 'world' });
    const delivery = await waitForSettled(event);

    expect(delivery.status).toBe('FAILED');
    expect(delivery.attempts).toBe(3);
    expect(delivery.lastError).toContain('ERP caído');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
