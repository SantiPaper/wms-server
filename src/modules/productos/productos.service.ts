import { InventoryStatus } from '@prisma/client';
import { prisma } from '@/lib/prismadb';
import {
  AddProductStockInput,
  CreateProductInput,
  ListProductsQuery,
  UpdateProductInput,
} from '@/modules/productos/productos.schemas';
import { NotFoundError } from '@/errors/NotFoundError';
import { BadRequestError } from '@/errors/BadRequestError';

export function createProduct(data: CreateProductInput) {
  return prisma.product.create({ data });
}

export async function listProducts(query: ListProductsQuery) {
  const where = {
    ...(query.sku ? { sku: { contains: query.sku, mode: 'insensitive' as const } } : {}),
    ...(query.barcode ? { barcode: query.barcode } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      orderBy: { id: 'asc' },
    }),
    prisma.product.count({ where }),
  ]);
  return { items, total, page: query.page, pageSize: query.pageSize };
}

export async function getProductById(id: number) {
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) throw new NotFoundError('Producto no encontrado');
  return product;
}

export async function updateProduct(id: number, data: UpdateProductInput) {
  await getProductById(id);
  return prisma.product.update({ where: { id }, data });
}

export async function deleteProduct(id: number) {
  await getProductById(id);
  await prisma.product.delete({ where: { id } });
}

/**
 * Carga manual de stock — el mismo efecto que dejaría una recepción formal, pero sin pasar por un
 * InboundOrder (útil para el alta inicial de un producto o para cargar stock que llegó fuera del
 * flujo de ERP). Queda sin LPN (lpnId null) — no es mercadería que haya pasado por el proceso de
 * recepción con lote/pallet, es una carga directa a una ubicación.
 */
export async function addProductStock(productId: number, input: AddProductStockInput) {
  const product = await getProductById(productId);

  const location = await prisma.location.findUnique({ where: { id: input.locationId } });
  if (!location) throw new NotFoundError('Ubicación no encontrada');
  if (location.isBlocked) {
    throw new BadRequestError('La ubicación está bloqueada', 'LOCATION_BLOCKED');
  }
  if (product.requiresBatch && !input.batchNumber) {
    throw new BadRequestError('El producto requiere número de lote', 'BATCH_REQUIRED');
  }
  if (product.requiresExpiration && !input.expirationDate) {
    throw new BadRequestError('El producto requiere fecha de vencimiento', 'EXPIRATION_REQUIRED');
  }

  const batchNumber = input.batchNumber ?? null;
  const expirationDate = input.expirationDate ?? null;

  const existing = await prisma.inventory.findFirst({
    where: {
      productId,
      locationId: input.locationId,
      lpnId: null,
      batchNumber,
      expirationDate,
      status: InventoryStatus.AVAILABLE,
    },
  });
  if (existing) {
    return prisma.inventory.update({
      where: { id: existing.id },
      data: { quantity: { increment: input.quantity } },
    });
  }
  return prisma.inventory.create({
    data: {
      productId,
      locationId: input.locationId,
      quantity: input.quantity,
      batchNumber,
      expirationDate,
      status: InventoryStatus.AVAILABLE,
    },
  });
}
