import { computeReceptionSplit } from '@/modules/inbound/overreception.service';

describe('computeReceptionSplit', () => {
  it('commits the full scan when it matches exactly what is expected', () => {
    expect(computeReceptionSplit(10, 0, 10)).toEqual({ committedQty: 10, excessQty: 0 });
  });

  it('commits the full scan when it is under what is expected', () => {
    expect(computeReceptionSplit(10, 0, 5)).toEqual({ committedQty: 5, excessQty: 0 });
  });

  it('commits exactly the remaining quantity when the scan fills it precisely', () => {
    expect(computeReceptionSplit(10, 6, 4)).toEqual({ committedQty: 4, excessQty: 0 });
  });

  it('splits into committed + excess when the scan exceeds what remains', () => {
    expect(computeReceptionSplit(10, 0, 15)).toEqual({ committedQty: 10, excessQty: 5 });
  });

  it('treats the whole scan as excess when the item is already fully received', () => {
    expect(computeReceptionSplit(10, 10, 5)).toEqual({ committedQty: 0, excessQty: 5 });
  });

  it('returns zero/zero for a zero-quantity scan', () => {
    expect(computeReceptionSplit(10, 0, 0)).toEqual({ committedQty: 0, excessQty: 0 });
  });
});
