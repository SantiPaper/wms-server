export interface ReceptionSplit {
  committedQty: number;
  excessQty: number;
}

/**
 * Splits a scanned "good" quantity into what fits within the item's expected
 * quantity (committed immediately) and what exceeds it (needs SUPERVISOR/ADMIN
 * approval before it becomes stock).
 */
export function computeReceptionSplit(
  expectedQuantity: number,
  alreadyReceived: number,
  scannedGoodQty: number,
): ReceptionSplit {
  const remaining = Math.max(expectedQuantity - alreadyReceived, 0);
  const committedQty = Math.min(scannedGoodQty, remaining);
  const excessQty = scannedGoodQty - committedQty;
  return { committedQty, excessQty };
}
