import { allocateFromCandidates, AllocationCandidate } from '@/modules/outbound/allocation.service';

function candidate(overrides: Partial<AllocationCandidate> & { inventoryId: number }): AllocationCandidate {
  return {
    locationId: overrides.inventoryId,
    locationCode: `LOC-${overrides.inventoryId}`,
    batchNumber: null,
    expirationDate: null,
    availableQty: 0,
    ...overrides,
  };
}

describe('allocateFromCandidates', () => {
  it('covers the full need from a single candidate', () => {
    const candidates = [candidate({ inventoryId: 1, availableQty: 20 })];
    const { reservations, remaining } = allocateFromCandidates(candidates, 10);
    expect(remaining).toBe(0);
    expect(reservations).toEqual([expect.objectContaining({ inventoryId: 1, quantity: 10 })]);
  });

  it('spreads the need across multiple candidates when one alone is not enough', () => {
    const candidates = [
      candidate({ inventoryId: 1, availableQty: 4 }),
      candidate({ inventoryId: 2, availableQty: 10 }),
    ];
    const { reservations, remaining } = allocateFromCandidates(candidates, 10);
    expect(remaining).toBe(0);
    expect(reservations).toEqual([
      expect.objectContaining({ inventoryId: 1, quantity: 4 }),
      expect.objectContaining({ inventoryId: 2, quantity: 6 }),
    ]);
  });

  it('reports the exact shortfall when total availability is insufficient', () => {
    const candidates = [
      candidate({ inventoryId: 1, availableQty: 3 }),
      candidate({ inventoryId: 2, availableQty: 2 }),
    ];
    const { reservations, remaining } = allocateFromCandidates(candidates, 10);
    expect(remaining).toBe(5);
    expect(reservations.reduce((sum, r) => sum + r.quantity, 0)).toBe(5);
  });

  it('returns everything as remaining for an empty candidate list', () => {
    const { reservations, remaining } = allocateFromCandidates([], 7);
    expect(reservations).toEqual([]);
    expect(remaining).toBe(7);
  });

  it('skips candidates with zero or negative available quantity without reordering the rest', () => {
    const candidates = [
      candidate({ inventoryId: 1, availableQty: 0 }),
      candidate({ inventoryId: 2, availableQty: -3 }),
      candidate({ inventoryId: 3, availableQty: 5 }),
    ];
    const { reservations, remaining } = allocateFromCandidates(candidates, 5);
    expect(remaining).toBe(0);
    expect(reservations).toEqual([expect.objectContaining({ inventoryId: 3, quantity: 5 })]);
  });

  it('respects the given candidate order verbatim (caller is responsible for zone/FEFO/FIFO ordering)', () => {
    const candidates = [
      candidate({ inventoryId: 2, availableQty: 5 }),
      candidate({ inventoryId: 1, availableQty: 5 }),
    ];
    const { reservations } = allocateFromCandidates(candidates, 5);
    expect(reservations[0].inventoryId).toBe(2);
  });

  it('returns zero remaining and no reservations when nothing is needed', () => {
    const candidates = [candidate({ inventoryId: 1, availableQty: 10 })];
    const { reservations, remaining } = allocateFromCandidates(candidates, 0);
    expect(reservations).toEqual([]);
    expect(remaining).toBe(0);
  });
});
