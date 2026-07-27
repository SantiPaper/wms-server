import { computeLpnWeightKg, fitsWeight, pickPutawayCandidate, RankedCandidate } from '@/modules/lpns/putaway.service';
import { ZoneType } from '@prisma/client';

function candidate(reason: RankedCandidate['reason'], maxWeightKg: number | null): RankedCandidate {
  return {
    reason,
    location: { id: 1, locationCode: `LOC-${reason}`, zoneType: ZoneType.STORAGE_RESERVE, maxWeightKg },
  };
}

describe('fitsWeight', () => {
  it('never blocks when weight enforcement is disabled', () => {
    expect(fitsWeight(10, 100, false)).toBe(true);
  });

  it('blocks a location whose max weight is exceeded when both weights are known and enforcement is on', () => {
    expect(fitsWeight(50, 100, true)).toBe(false);
  });

  it('allows a location within capacity when enforcement is on', () => {
    expect(fitsWeight(200, 100, true)).toBe(true);
  });

  it('does not block when the LPN weight is unknown (null), even with enforcement on', () => {
    expect(fitsWeight(50, null, true)).toBe(true);
  });

  it('does not block when the location has no configured max weight', () => {
    expect(fitsWeight(null, 100, true)).toBe(true);
  });
});

describe('pickPutawayCandidate', () => {
  it('picks the first candidate in priority order when it fits (consolidation over category/empty-slot)', () => {
    const candidates = [candidate('CONSOLIDATION', null), candidate('CATEGORY', null), candidate('EMPTY_SLOT', null)];
    const picked = pickPutawayCandidate(candidates, 100, false);
    expect(picked?.reason).toBe('CONSOLIDATION');
  });

  it('reflects rotationClass A ordering (PICKING_ACTIVE candidate placed before STORAGE_RESERVE)', () => {
    const pickingActive: RankedCandidate = {
      reason: 'CATEGORY',
      location: { id: 1, locationCode: 'PICK-01', zoneType: ZoneType.PICKING_ACTIVE, maxWeightKg: null },
    };
    const storageReserve: RankedCandidate = {
      reason: 'CATEGORY',
      location: { id: 2, locationCode: 'STOR-01', zoneType: ZoneType.STORAGE_RESERVE, maxWeightKg: null },
    };
    const picked = pickPutawayCandidate([pickingActive, storageReserve], null, false);
    expect(picked?.location.zoneType).toBe(ZoneType.PICKING_ACTIVE);
  });

  it('skips an over-capacity candidate and falls through to the next one that fits', () => {
    const tooSmall = candidate('CONSOLIDATION', 10);
    const fits = candidate('CATEGORY', 200);
    const picked = pickPutawayCandidate([tooSmall, fits], 100, true);
    expect(picked?.reason).toBe('CATEGORY');
  });

  it('returns null when no candidate fits', () => {
    const tooSmall1 = candidate('CONSOLIDATION', 10);
    const tooSmall2 = candidate('EMPTY_SLOT', 20);
    const picked = pickPutawayCandidate([tooSmall1, tooSmall2], 100, true);
    expect(picked).toBeNull();
  });

  it('returns null for an empty candidate list', () => {
    expect(pickPutawayCandidate([], null, false)).toBeNull();
  });
});

describe('computeLpnWeightKg', () => {
  it('sums quantity * product weight across all inventory rows', () => {
    const total = computeLpnWeightKg([
      { quantity: 2, product: { weightKg: 1.5 } },
      { quantity: 3, product: { weightKg: 2 } },
    ]);
    expect(total).toBe(9);
  });

  it('returns null if any row has an unknown product weight', () => {
    const total = computeLpnWeightKg([
      { quantity: 2, product: { weightKg: 1.5 } },
      { quantity: 3, product: { weightKg: null } },
    ]);
    expect(total).toBeNull();
  });
});
