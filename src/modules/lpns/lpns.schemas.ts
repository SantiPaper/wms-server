import { z } from 'zod';

export const lpnCodeParamSchema = z.object({
  lpnCode: z.string().min(1),
});

export const confirmPutawaySchema = z.object({
  locationCode: z.string().min(1),
});

export type ConfirmPutawayInput = z.infer<typeof confirmPutawaySchema>;
