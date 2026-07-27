import request from 'supertest';
import { Express } from 'express';
import { RotationClass, ZoneType } from '@prisma/client';
import { prisma } from '@/lib/prismadb';
import { hashPassword } from '@/modules/auth/password.util';
import { env } from '@/lib/env';

export const TEST_PASSWORD = 'password123';

export async function resetDb() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE picking_tasks, picking_waves, outbound_order_items, outbound_orders, ' +
      'reception_events, inbound_order_items, inbound_orders, inventory, lpns, locations, products, users, ' +
      'webhook_deliveries ' +
      'RESTART IDENTITY CASCADE;',
  );
}

export async function seedBaseline() {
  const passwordHash = await hashPassword(TEST_PASSWORD);
  const [admin, supervisor, operario] = await Promise.all([
    prisma.user.create({ data: { email: 'admin@test.local', passwordHash, role: 'ADMIN' } }),
    prisma.user.create({ data: { email: 'supervisor@test.local', passwordHash, role: 'SUPERVISOR' } }),
    prisma.user.create({ data: { email: 'operario@test.local', passwordHash, role: 'OPERARIO' } }),
  ]);

  const [receiving, quarantine, storage1, storage2, pickingActive] = await Promise.all([
    prisma.location.create({ data: { locationCode: 'RECV-01', zoneType: ZoneType.RECEIVING } }),
    prisma.location.create({ data: { locationCode: 'QRT-01', zoneType: ZoneType.QUARANTINE } }),
    prisma.location.create({ data: { locationCode: 'STO-01', zoneType: ZoneType.STORAGE_RESERVE } }),
    prisma.location.create({ data: { locationCode: 'STO-02', zoneType: ZoneType.STORAGE_RESERVE } }),
    prisma.location.create({ data: { locationCode: 'PICK-01', zoneType: ZoneType.PICKING_ACTIVE } }),
  ]);

  const product = await prisma.product.create({
    data: {
      sku: 'SKU-TEST-1',
      barcode: '1111111111111',
      description: 'Producto de test',
      rotationClass: RotationClass.B,
    },
  });

  const batchProduct = await prisma.product.create({
    data: {
      sku: 'SKU-TEST-BATCH',
      barcode: '2222222222222',
      description: 'Producto con lote y vencimiento',
      requiresBatch: true,
      requiresExpiration: true,
      rotationClass: RotationClass.A,
    },
  });

  return { admin, supervisor, operario, receiving, quarantine, storage1, storage2, pickingActive, product, batchProduct };
}

/**
 * Extra fixtures for Outbound/Picking tests only — kept separate from `seedBaseline` so adding
 * stock/locations here never changes Stage 1 (Inbound/putaway) tests' candidate search results.
 * Locations use conforming hierarchical codes (DEP-Z-P0X-M0X-N) so the S-route parser and
 * allocation zone-priority logic have real aisle/module data to work with.
 */
export async function seedOutboundFixtures() {
  const [pickingAisle1, pickingAisle2, reserveAisle1, reserveAisle3] = await Promise.all([
    prisma.location.create({ data: { locationCode: 'DEP1-Z1-P01-M01-N1', zoneType: ZoneType.PICKING_ACTIVE } }),
    prisma.location.create({ data: { locationCode: 'DEP1-Z1-P02-M01-N1', zoneType: ZoneType.PICKING_ACTIVE } }),
    prisma.location.create({ data: { locationCode: 'DEP1-Z1-P01-M02-N1', zoneType: ZoneType.STORAGE_RESERVE } }),
    prisma.location.create({ data: { locationCode: 'DEP1-Z1-P03-M01-N1', zoneType: ZoneType.STORAGE_RESERVE } }),
  ]);

  const outProduct = await prisma.product.create({
    data: {
      sku: 'SKU-OUT-1',
      barcode: '3333333333333',
      description: 'Producto de test (outbound)',
      rotationClass: RotationClass.B,
    },
  });

  const outBatchProduct = await prisma.product.create({
    data: {
      sku: 'SKU-OUT-BATCH',
      barcode: '4444444444444',
      description: 'Producto con lote (outbound)',
      requiresBatch: true,
      requiresExpiration: true,
      rotationClass: RotationClass.A,
    },
  });

  const [pickingStock, reserveStock] = await Promise.all([
    prisma.inventory.create({
      data: { productId: outProduct.id, locationId: pickingAisle1.id, quantity: 100, status: 'AVAILABLE' },
    }),
    prisma.inventory.create({
      data: {
        productId: outBatchProduct.id,
        locationId: reserveAisle1.id,
        quantity: 50,
        batchNumber: 'L-OUT-1',
        expirationDate: new Date('2027-06-01'),
        status: 'AVAILABLE',
      },
    }),
  ]);

  return {
    pickingAisle1,
    pickingAisle2,
    reserveAisle1,
    reserveAisle3,
    outProduct,
    outBatchProduct,
    pickingStock,
    reserveStock,
  };
}

export async function loginAs(app: Express, email: string): Promise<string[]> {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password: TEST_PASSWORD });
  const cookies = res.headers['set-cookie'];
  if (!cookies) throw new Error(`Login falló para ${email}: ${JSON.stringify(res.body)}`);
  return Array.isArray(cookies) ? cookies : [cookies];
}

export function webhookHeaders() {
  return { 'X-Webhook-Secret': env.ERP_WEBHOOK_SECRET };
}
