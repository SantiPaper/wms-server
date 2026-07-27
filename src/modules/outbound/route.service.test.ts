import { parseLocationCode, sortPickingTasksSRoute } from '@/modules/outbound/route.service';

describe('parseLocationCode', () => {
  it('parses aisle and module from a full hierarchical code', () => {
    expect(parseLocationCode('DEP1-Z1-P03-M02-N1')).toEqual({ aisle: 3, module: 2 });
  });

  it('parses codes with a trailing position segment', () => {
    expect(parseLocationCode('DEP1-Z1-P03-M02-N1-A')).toEqual({ aisle: 3, module: 2 });
  });

  it('is case-insensitive on the P/M prefixes', () => {
    expect(parseLocationCode('dep1-z1-p03-m02-n1')).toEqual({ aisle: 3, module: 2 });
  });

  it('returns null for codes without both aisle and module segments', () => {
    expect(parseLocationCode('STO-01')).toBeNull();
    expect(parseLocationCode('PICK-01')).toBeNull();
    expect(parseLocationCode('RECV-01')).toBeNull();
  });
});

describe('sortPickingTasksSRoute', () => {
  function task(fromLocationCode: string) {
    return { fromLocationCode };
  }

  it('orders aisles ascending', () => {
    const tasks = [task('DEP1-Z1-P02-M01-N1'), task('DEP1-Z1-P01-M01-N1')];
    const sorted = sortPickingTasksSRoute(tasks);
    expect(sorted.map((t) => t.fromLocationCode)).toEqual([
      'DEP1-Z1-P01-M01-N1',
      'DEP1-Z1-P02-M01-N1',
    ]);
  });

  it('orders modules ascending within an odd aisle', () => {
    const tasks = [task('DEP1-Z1-P01-M02-N1'), task('DEP1-Z1-P01-M01-N1')];
    const sorted = sortPickingTasksSRoute(tasks);
    expect(sorted.map((t) => t.fromLocationCode)).toEqual([
      'DEP1-Z1-P01-M01-N1',
      'DEP1-Z1-P01-M02-N1',
    ]);
  });

  it('orders modules descending within an even aisle', () => {
    const tasks = [task('DEP1-Z1-P02-M01-N1'), task('DEP1-Z1-P02-M02-N1')];
    const sorted = sortPickingTasksSRoute(tasks);
    expect(sorted.map((t) => t.fromLocationCode)).toEqual([
      'DEP1-Z1-P02-M02-N1',
      'DEP1-Z1-P02-M01-N1',
    ]);
  });

  it('produces a full S-route across several aisles', () => {
    const tasks = [
      task('DEP1-Z1-P02-M02-N1'),
      task('DEP1-Z1-P01-M02-N1'),
      task('DEP1-Z1-P02-M01-N1'),
      task('DEP1-Z1-P01-M01-N1'),
      task('DEP1-Z1-P03-M01-N1'),
    ];
    const sorted = sortPickingTasksSRoute(tasks);
    expect(sorted.map((t) => t.fromLocationCode)).toEqual([
      'DEP1-Z1-P01-M01-N1', // aisle 1 (odd) asc
      'DEP1-Z1-P01-M02-N1',
      'DEP1-Z1-P02-M02-N1', // aisle 2 (even) desc
      'DEP1-Z1-P02-M01-N1',
      'DEP1-Z1-P03-M01-N1', // aisle 3 (odd) asc
    ]);
  });

  it('appends non-conforming codes at the end, sorted alphabetically', () => {
    const tasks = [
      task('PICK-02'),
      task('DEP1-Z1-P01-M01-N1'),
      task('PICK-01'),
    ];
    const sorted = sortPickingTasksSRoute(tasks);
    expect(sorted.map((t) => t.fromLocationCode)).toEqual([
      'DEP1-Z1-P01-M01-N1',
      'PICK-01',
      'PICK-02',
    ]);
  });

  it('returns an empty array unchanged', () => {
    expect(sortPickingTasksSRoute([])).toEqual([]);
  });
});
