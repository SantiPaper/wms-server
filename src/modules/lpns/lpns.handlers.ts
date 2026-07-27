import { Request, Response } from 'express';
import * as putawayService from '@/modules/lpns/putaway.service';
import { ConfirmPutawayInput } from '@/modules/lpns/lpns.schemas';

export async function putawaySuggestionHandler(req: Request, res: Response) {
  const { lpnCode } = req.params;
  const suggestion = await putawayService.suggestPutawayLocation(lpnCode);
  res.json({
    reason: suggestion.reason,
    locationCode: suggestion.location.locationCode,
    locationId: suggestion.location.id,
  });
}

export async function confirmPutawayHandler(req: Request, res: Response) {
  const { lpnCode } = req.params;
  const { locationCode } = req.body as ConfirmPutawayInput;
  const result = await putawayService.confirmPutaway(lpnCode, locationCode);
  res.json(result);
}
