-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'SUPERVISOR', 'OPERARIO');

-- CreateEnum
CREATE TYPE "ZoneType" AS ENUM ('RECEIVING', 'STORAGE_RESERVE', 'PICKING_ACTIVE', 'CROSS_DOCK', 'STAGING_OUT', 'QUARANTINE');

-- CreateEnum
CREATE TYPE "LpnStatus" AS ENUM ('IN_STOCK', 'IN_TRANSIT', 'SHIPPED');

-- CreateEnum
CREATE TYPE "InventoryStatus" AS ENUM ('AVAILABLE', 'QUARANTINE', 'DAMAGED', 'DISCREPANCY');

-- CreateEnum
CREATE TYPE "RotationClass" AS ENUM ('A', 'B', 'C');

-- CreateEnum
CREATE TYPE "InboundOrderStatus" AS ENUM ('EXPECTED', 'IN_RECEIVING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ReceptionEventKind" AS ENUM ('GOOD', 'DAMAGED', 'EXCESS');

-- CreateEnum
CREATE TYPE "ReceptionEventStatus" AS ENUM ('COMMITTED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'OPERARIO',
    "refreshTokenHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" SERIAL NOT NULL,
    "sku" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "unitOfMeasure" TEXT NOT NULL DEFAULT 'UNI',
    "requiresBatch" BOOLEAN NOT NULL DEFAULT false,
    "requiresExpiration" BOOLEAN NOT NULL DEFAULT false,
    "rotationClass" "RotationClass" NOT NULL DEFAULT 'B',
    "weightKg" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" SERIAL NOT NULL,
    "locationCode" TEXT NOT NULL,
    "zoneType" "ZoneType" NOT NULL,
    "maxWeightKg" DECIMAL(10,2),
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lpns" (
    "id" SERIAL NOT NULL,
    "lpnCode" TEXT NOT NULL,
    "currentLocationId" INTEGER,
    "status" "LpnStatus" NOT NULL DEFAULT 'IN_STOCK',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lpns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "locationId" INTEGER NOT NULL,
    "lpnId" INTEGER,
    "batchNumber" TEXT,
    "expirationDate" DATE,
    "quantity" INTEGER NOT NULL,
    "allocatedQuantity" INTEGER NOT NULL DEFAULT 0,
    "status" "InventoryStatus" NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbound_orders" (
    "id" SERIAL NOT NULL,
    "supplierCode" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "status" "InboundOrderStatus" NOT NULL DEFAULT 'EXPECTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "inbound_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbound_order_items" (
    "id" SERIAL NOT NULL,
    "inboundOrderId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "expectedQuantity" INTEGER NOT NULL,
    "receivedQuantity" INTEGER NOT NULL DEFAULT 0,
    "damagedQuantity" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "inbound_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reception_events" (
    "id" SERIAL NOT NULL,
    "inboundOrderItemId" INTEGER NOT NULL,
    "lpnId" INTEGER NOT NULL,
    "locationId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "kind" "ReceptionEventKind" NOT NULL,
    "batchNumber" TEXT,
    "expirationDate" DATE,
    "status" "ReceptionEventStatus" NOT NULL DEFAULT 'COMMITTED',
    "scannedByUserId" INTEGER,
    "approvedByUserId" INTEGER,
    "approvedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reception_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "products_barcode_key" ON "products"("barcode");

-- CreateIndex
CREATE UNIQUE INDEX "locations_locationCode_key" ON "locations"("locationCode");

-- CreateIndex
CREATE INDEX "locations_zoneType_isBlocked_idx" ON "locations"("zoneType", "isBlocked");

-- CreateIndex
CREATE UNIQUE INDEX "lpns_lpnCode_key" ON "lpns"("lpnCode");

-- CreateIndex
CREATE INDEX "lpns_currentLocationId_idx" ON "lpns"("currentLocationId");

-- CreateIndex
CREATE INDEX "inventory_productId_status_idx" ON "inventory"("productId", "status");

-- CreateIndex
CREATE INDEX "inventory_productId_expirationDate_idx" ON "inventory"("productId", "expirationDate");

-- CreateIndex
CREATE INDEX "inventory_productId_createdAt_idx" ON "inventory"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "inventory_locationId_idx" ON "inventory"("locationId");

-- CreateIndex
CREATE INDEX "inventory_lpnId_idx" ON "inventory"("lpnId");

-- CreateIndex
CREATE UNIQUE INDEX "inbound_orders_externalId_key" ON "inbound_orders"("externalId");

-- CreateIndex
CREATE INDEX "inbound_orders_status_idx" ON "inbound_orders"("status");

-- CreateIndex
CREATE UNIQUE INDEX "inbound_order_items_inboundOrderId_productId_key" ON "inbound_order_items"("inboundOrderId", "productId");

-- CreateIndex
CREATE INDEX "reception_events_inboundOrderItemId_status_idx" ON "reception_events"("inboundOrderItemId", "status");

-- AddForeignKey
ALTER TABLE "lpns" ADD CONSTRAINT "lpns_currentLocationId_fkey" FOREIGN KEY ("currentLocationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_lpnId_fkey" FOREIGN KEY ("lpnId") REFERENCES "lpns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_order_items" ADD CONSTRAINT "inbound_order_items_inboundOrderId_fkey" FOREIGN KEY ("inboundOrderId") REFERENCES "inbound_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_order_items" ADD CONSTRAINT "inbound_order_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reception_events" ADD CONSTRAINT "reception_events_inboundOrderItemId_fkey" FOREIGN KEY ("inboundOrderItemId") REFERENCES "inbound_order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reception_events" ADD CONSTRAINT "reception_events_lpnId_fkey" FOREIGN KEY ("lpnId") REFERENCES "lpns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reception_events" ADD CONSTRAINT "reception_events_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reception_events" ADD CONSTRAINT "reception_events_scannedByUserId_fkey" FOREIGN KEY ("scannedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reception_events" ADD CONSTRAINT "reception_events_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CheckConstraints (invariantes de negocio de inventario, no soportadas por la sintaxis de Prisma)
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_quantity_nonneg" CHECK ("quantity" >= 0);
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_alloc_le_qty" CHECK ("allocatedQuantity" <= "quantity");
