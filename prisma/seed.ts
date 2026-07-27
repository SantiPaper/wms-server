import { PrismaClient, Role, ZoneType, RotationClass } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('password123', 10);

  await prisma.user.upsert({
    where: { email: 'admin@wms.local' },
    update: {},
    create: { email: 'admin@wms.local', passwordHash, role: Role.ADMIN },
  });
  await prisma.user.upsert({
    where: { email: 'supervisor@wms.local' },
    update: {},
    create: { email: 'supervisor@wms.local', passwordHash, role: Role.SUPERVISOR },
  });
  await prisma.user.upsert({
    where: { email: 'operario@wms.local' },
    update: {},
    create: { email: 'operario@wms.local', passwordHash, role: Role.OPERARIO },
  });

  const locations = [
    { locationCode: 'DEP1-Z1-RECV-01', zoneType: ZoneType.RECEIVING },
    { locationCode: 'DEP1-Z1-QRT-01', zoneType: ZoneType.QUARANTINE },
    { locationCode: 'DEP1-Z1-P01-M01-N1', zoneType: ZoneType.STORAGE_RESERVE, maxWeightKg: 500 },
    { locationCode: 'DEP1-Z1-P01-M02-N1', zoneType: ZoneType.STORAGE_RESERVE, maxWeightKg: 500 },
    { locationCode: 'DEP1-Z1-P02-M01-N1', zoneType: ZoneType.PICKING_ACTIVE, maxWeightKg: 100 },
  ];
  for (const loc of locations) {
    await prisma.location.upsert({
      where: { locationCode: loc.locationCode },
      update: {},
      create: loc,
    });
  }

  await prisma.product.upsert({
    where: { sku: 'PROD-ABC-123' },
    update: {},
    create: {
      sku: 'PROD-ABC-123',
      barcode: '7791234567890',
      description: 'Auriculares Inalámbricos X20',
      rotationClass: RotationClass.A,
      weightKg: 0.3,
    },
  });

  await prisma.product.upsert({
    where: { sku: 'PROD-XYZ-999' },
    update: {},
    create: {
      sku: 'PROD-XYZ-999',
      barcode: '7799876543210',
      description: 'Producto con lote y vencimiento',
      requiresBatch: true,
      requiresExpiration: true,
      rotationClass: RotationClass.C,
      weightKg: 1.2,
    },
  });

  console.log('Seed completado.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
