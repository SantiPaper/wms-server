export interface ParsedLocationCode {
  aisle: number;
  module: number;
}

/**
 * Extracts the aisle ("Pasillo", segment `P0X`) and module ("Módulo", segment `M0X`) from a
 * hierarchical location code like `DEP1-Z1-P03-M02-N1-A`. Returns null for codes that don't carry
 * both segments (e.g. simple test codes like `STO-01`) — callers must degrade gracefully rather
 * than throw, since not every location is expected to follow the full warehouse hierarchy.
 */
export function parseLocationCode(locationCode: string): ParsedLocationCode | null {
  const segments = locationCode.split('-');
  const aisleSegment = segments.find((s) => /^P\d+$/i.test(s));
  const moduleSegment = segments.find((s) => /^M\d+$/i.test(s));
  if (!aisleSegment || !moduleSegment) return null;
  return {
    aisle: parseInt(aisleSegment.slice(1), 10),
    module: parseInt(moduleSegment.slice(1), 10),
  };
}

/**
 * Orders picking tasks along an "S" route: aisle ascending; within an aisle, module ascending on
 * odd aisles and descending on even aisles (so the picker never backtracks). Tasks whose location
 * code doesn't carry a parseable aisle/module are appended at the end, alphabetically by code,
 * since their real physical position relative to the rest of the route is unknown.
 */
export function sortPickingTasksSRoute<T extends { fromLocationCode: string }>(tasks: T[]): T[] {
  const withRoute: { task: T; parsed: ParsedLocationCode }[] = [];
  const withoutRoute: T[] = [];

  for (const task of tasks) {
    const parsed = parseLocationCode(task.fromLocationCode);
    if (parsed) {
      withRoute.push({ task, parsed });
    } else {
      withoutRoute.push(task);
    }
  }

  withRoute.sort((a, b) => {
    if (a.parsed.aisle !== b.parsed.aisle) return a.parsed.aisle - b.parsed.aisle;
    const direction = a.parsed.aisle % 2 === 1 ? 1 : -1;
    if (a.parsed.module !== b.parsed.module) return direction * (a.parsed.module - b.parsed.module);
    return a.task.fromLocationCode.localeCompare(b.task.fromLocationCode);
  });
  withoutRoute.sort((a, b) => a.fromLocationCode.localeCompare(b.fromLocationCode));

  return [...withRoute.map((x) => x.task), ...withoutRoute];
}
