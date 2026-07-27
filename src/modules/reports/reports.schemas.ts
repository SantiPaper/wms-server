import { z } from 'zod';

export const throughputQuerySchema = z.object({
  since: z.coerce.date().optional(),
});

export type ThroughputQuery = z.infer<typeof throughputQuerySchema>;
