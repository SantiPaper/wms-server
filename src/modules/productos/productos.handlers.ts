import { Request, Response } from 'express';
import * as productosService from '@/modules/productos/productos.service';
import {
  AddProductStockInput,
  CreateProductInput,
  ListProductsQuery,
  UpdateProductInput,
} from '@/modules/productos/productos.schemas';
import { IdParam } from '@/lib/common.schemas';

export async function createProductHandler(req: Request, res: Response) {
  const product = await productosService.createProduct(req.body as CreateProductInput);
  res.status(201).json(product);
}

export async function listProductsHandler(req: Request, res: Response) {
  const result = await productosService.listProducts(req.query as unknown as ListProductsQuery);
  res.json(result);
}

export async function getProductHandler(req: Request, res: Response) {
  const { id } = req.params as unknown as IdParam;
  const product = await productosService.getProductById(id);
  res.json(product);
}

export async function updateProductHandler(req: Request, res: Response) {
  const { id } = req.params as unknown as IdParam;
  const product = await productosService.updateProduct(id, req.body as UpdateProductInput);
  res.json(product);
}

export async function deleteProductHandler(req: Request, res: Response) {
  const { id } = req.params as unknown as IdParam;
  await productosService.deleteProduct(id);
  res.status(204).send();
}

export async function addProductStockHandler(req: Request, res: Response) {
  const { id } = req.params as unknown as IdParam;
  const inventory = await productosService.addProductStock(id, req.body as AddProductStockInput);
  res.status(201).json(inventory);
}
