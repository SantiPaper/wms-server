import { Request, Response } from 'express';
import * as ubicacionesService from '@/modules/ubicaciones/ubicaciones.service';
import {
  CreateLocationInput,
  ListLocationsQuery,
  UpdateLocationInput,
} from '@/modules/ubicaciones/ubicaciones.schemas';
import { IdParam } from '@/lib/common.schemas';

export async function createLocationHandler(req: Request, res: Response) {
  const location = await ubicacionesService.createLocation(req.body as CreateLocationInput);
  res.status(201).json(location);
}

export async function listLocationsHandler(req: Request, res: Response) {
  const locations = await ubicacionesService.listLocations(req.query as unknown as ListLocationsQuery);
  res.json(locations);
}

export async function getLocationHandler(req: Request, res: Response) {
  const { id } = req.params as unknown as IdParam;
  const location = await ubicacionesService.getLocationById(id);
  res.json(location);
}

export async function updateLocationHandler(req: Request, res: Response) {
  const { id } = req.params as unknown as IdParam;
  const location = await ubicacionesService.updateLocation(id, req.body as UpdateLocationInput);
  res.json(location);
}

export async function deleteLocationHandler(req: Request, res: Response) {
  const { id } = req.params as unknown as IdParam;
  await ubicacionesService.deleteLocation(id);
  res.status(204).send();
}
