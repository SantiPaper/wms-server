-- CreateEnum
CREATE TYPE "OutboundOrderStatus" AS ENUM ('CREATED', 'ALLOCATED', 'IN_PICKING', 'PACKED', 'SHIPPED');

-- CreateEnum
CREATE TYPE "OutboundOrderPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "PickingTaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'SHORTAGE');

-- CreateTable
CREATE TABLE "outbound_orders" (
    "id" SERIAL NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "customerName" TEXT,
    "shippingAddress" TEXT,
    "priority" "OutboundOrderPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "OutboundOrderStatus" NOT NULL DEFAULT 'CREATED',
    "waveId" INTEGER,
    "trackingNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "allocatedAt" TIMESTAMP(3),
    "packedAt" TIMESTAMP(3),
    "shippedAt" TIMESTAMP(3),

    CONSTRAINT "outbound_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbound_order_items" (
    "id" SERIAL NOT NULL,
    "outboundOrderId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "orderedQuantity" INTEGER NOT NULL,
    "allocatedQuantity" INTEGER NOT NULL DEFAULT 0,
    "pickedQuantity" INTEGER NOT NULL DEFAULT 0,
    "shortedQuantity" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "outbound_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "picking_waves" (
    "id" SERIAL NOT NULL,
    "releasedByUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "picking_waves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "picking_tasks" (
    "id" SERIAL NOT NULL,
    "outboundOrderId" INTEGER NOT NULL,
    "outboundOrderItemId" INTEGER NOT NULL,
    "waveId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "fromLocationId" INTEGER NOT NULL,
    "inventoryId" INTEGER NOT NULL,
    "batchNumber" TEXT,
    "expirationDate" DATE,
    "requiredQuantity" INTEGER NOT NULL,
    "pickedQuantity" INTEGER NOT NULL DEFAULT 0,
    "routeSequence" INTEGER NOT NULL,
    "status" "PickingTaskStatus" NOT NULL DEFAULT 'PENDING',
    "rerouteOfTaskId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "picking_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "outbound_orders_orderNumber_key" ON "outbound_orders"("orderNumber");

-- CreateIndex
CREATE INDEX "outbound_orders_status_idx" ON "outbound_orders"("status");

-- CreateIndex
CREATE INDEX "outbound_orders_waveId_idx" ON "outbound_orders"("waveId");

-- CreateIndex
CREATE UNIQUE INDEX "outbound_order_items_outboundOrderId_productId_key" ON "outbound_order_items"("outboundOrderId", "productId");

-- CreateIndex
CREATE INDEX "picking_tasks_outboundOrderId_idx" ON "picking_tasks"("outboundOrderId");

-- CreateIndex
CREATE INDEX "picking_tasks_waveId_routeSequence_idx" ON "picking_tasks"("waveId", "routeSequence");

-- CreateIndex
CREATE INDEX "picking_tasks_status_idx" ON "picking_tasks"("status");

-- CreateIndex
CREATE INDEX "picking_tasks_fromLocationId_idx" ON "picking_tasks"("fromLocationId");

-- AddForeignKey
ALTER TABLE "outbound_orders" ADD CONSTRAINT "outbound_orders_waveId_fkey" FOREIGN KEY ("waveId") REFERENCES "picking_waves"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbound_order_items" ADD CONSTRAINT "outbound_order_items_outboundOrderId_fkey" FOREIGN KEY ("outboundOrderId") REFERENCES "outbound_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbound_order_items" ADD CONSTRAINT "outbound_order_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "picking_waves" ADD CONSTRAINT "picking_waves_releasedByUserId_fkey" FOREIGN KEY ("releasedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "picking_tasks" ADD CONSTRAINT "picking_tasks_outboundOrderId_fkey" FOREIGN KEY ("outboundOrderId") REFERENCES "outbound_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "picking_tasks" ADD CONSTRAINT "picking_tasks_outboundOrderItemId_fkey" FOREIGN KEY ("outboundOrderItemId") REFERENCES "outbound_order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "picking_tasks" ADD CONSTRAINT "picking_tasks_waveId_fkey" FOREIGN KEY ("waveId") REFERENCES "picking_waves"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "picking_tasks" ADD CONSTRAINT "picking_tasks_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "picking_tasks" ADD CONSTRAINT "picking_tasks_fromLocationId_fkey" FOREIGN KEY ("fromLocationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "picking_tasks" ADD CONSTRAINT "picking_tasks_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "inventory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "picking_tasks" ADD CONSTRAINT "picking_tasks_rerouteOfTaskId_fkey" FOREIGN KEY ("rerouteOfTaskId") REFERENCES "picking_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CheckConstraint: allocatedQuantity nunca puede ir negativo (Stage 2 es la primera vez que se decrementa)
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_alloc_nonneg" CHECK ("allocatedQuantity" >= 0);
