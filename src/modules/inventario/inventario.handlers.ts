import { Request, Response } from 'express';
import * as inventarioService from '@/modules/inventario/inventario.service';
import { ListInventoryQuery } from '@/modules/inventario/inventario.schemas';

export async function listInventoryHandler(req: Request, res: Response) {
  const items = await inventarioService.listInventory(req.query as unknown as ListInventoryQuery);
  res.json(items);
}
