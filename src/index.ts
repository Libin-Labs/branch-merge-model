export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type Snapshot = { [key: string]: JsonValue };
export type MergeErrorCode = 'invalid' | 'limit' | 'missing' | 'conflict';
export class BranchMergeError extends Error {
  constructor(
    public readonly code: MergeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'BranchMergeError';
  }
}
export interface FieldValue {
  exists: boolean;
  value?: JsonValue;
}
export interface FieldChange {
  path: string[];
  before: FieldValue;
  after: FieldValue;
}
export interface MergeConflict {
  path: string[];
  base: FieldValue;
  left: FieldValue;
  right: FieldValue;
}
export interface MergePreview {
  snapshot: Snapshot;
  conflicts: MergeConflict[];
  changes: FieldChange[];
}
export interface MergeLimits {
  maxNodes?: number;
  maxDepth?: number;
  maxSnapshots?: number;
}
function fail(code: MergeErrorCode, message: string): never {
  throw new BranchMergeError(code, message);
}
function object(value: unknown): value is Snapshot {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  );
}
function limits(options: MergeLimits): { nodes: number; depth: number; snapshots: number } {
  const result = {
    nodes: options.maxNodes ?? 100000,
    depth: options.maxDepth ?? 64,
    snapshots: options.maxSnapshots ?? 1024,
  };
  for (const value of Object.values(result))
    if (!Number.isSafeInteger(value) || value < 1) fail('invalid', 'Invalid limits');
  return result;
}
function clone(snapshot: Snapshot, options: MergeLimits): Snapshot {
  if (!object(snapshot)) fail('invalid', 'Snapshot must be a plain object');
  const bound = limits(options);
  let nodes = 0;
  const seen = new Set<object>();
  function visit(value: unknown, depth: number): JsonValue {
    if (++nodes > bound.nodes || depth > bound.depth)
      fail('limit', 'Snapshot traversal bound exceeded');
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (!Array.isArray(value) && !object(value))
      fail('invalid', 'Only finite JSON values are supported');
    if (seen.has(value)) fail('invalid', 'Cyclic snapshot');
    seen.add(value);
    let result: JsonValue;
    if (Array.isArray(value)) {
      result = Array.from(value, (item) => visit(item, depth + 1));
    } else {
      const record: Snapshot = {};
      for (const key of Object.keys(value)) {
        Object.defineProperty(record, key, {
          value: visit(value[key], depth + 1),
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
      result = record;
    }
    seen.delete(value);
    return result;
  }
  return visit(snapshot, 0) as Snapshot;
}
function equal(a: FieldValue, b: FieldValue): boolean {
  if (a.exists !== b.exists) return false;
  if (!a.exists) return true;
  const x = a.value,
    y = b.value;
  if (x === y) return true;
  if (Array.isArray(x) && Array.isArray(y))
    return (
      x.length === y.length &&
      x.every((v, i) => equal({ exists: true, value: v }, { exists: true, value: y[i]! }))
    );
  if (object(x) && object(y))
    return (
      Object.keys(x).length === Object.keys(y).length &&
      Object.keys(x).every((k) => equal(field(x, k), field(y, k)))
    );
  return false;
}
function field(record: Snapshot, key: string): FieldValue {
  return Object.hasOwn(record, key) ? { exists: true, value: record[key]! } : { exists: false };
}
function assign(record: Snapshot, key: string, value: FieldValue): void {
  if (value.exists)
    Object.defineProperty(record, key, {
      value: value.value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
}
export function semanticDiff(
  before: Snapshot,
  after: Snapshot,
  options: MergeLimits = {},
): FieldChange[] {
  const a = clone(before, options),
    b = clone(after, options);
  const changes: FieldChange[] = [];
  function walk(x: Snapshot, y: Snapshot, path: string[]): void {
    for (const key of [...new Set([...Object.keys(x), ...Object.keys(y)])].sort()) {
      const left = field(x, key),
        right = field(y, key),
        next = [...path, key];
      if (equal(left, right)) continue;
      if (object(left.value) && object(right.value)) walk(left.value, right.value, next);
      else changes.push({ path: next, before: left, after: right });
    }
  }
  walk(a, b, []);
  return changes;
}
export function previewMerge(
  base: Snapshot,
  left: Snapshot,
  right: Snapshot,
  options: MergeLimits = {},
): MergePreview {
  const ancestor = clone(base, options),
    ours = clone(left, options),
    theirs = clone(right, options);
  const conflicts: MergeConflict[] = [];
  function merge(a: Snapshot, b: Snapshot, c: Snapshot, path: string[]): Snapshot {
    const result: Snapshot = {};
    for (const key of [
      ...new Set([...Object.keys(a), ...Object.keys(b), ...Object.keys(c)]),
    ].sort()) {
      const av = field(a, key),
        bv = field(b, key),
        cv = field(c, key),
        next = [...path, key];
      if (equal(bv, cv)) assign(result, key, bv);
      else if (equal(av, bv)) assign(result, key, cv);
      else if (equal(av, cv)) assign(result, key, bv);
      else if (object(bv.value) && object(cv.value) && (object(av.value) || !av.exists)) {
        assign(result, key, {
          exists: true,
          value: merge(object(av.value) ? av.value : {}, bv.value, cv.value, next),
        });
      } else {
        conflicts.push({ path: next, base: av, left: bv, right: cv });
        assign(result, key, av);
      }
    }
    return result;
  }
  const snapshot = merge(ancestor, ours, theirs, []);
  return { snapshot, conflicts, changes: semanticDiff(ancestor, snapshot, options) };
}
export interface Commit {
  id: string;
  parent: string | null;
  snapshot: Snapshot;
}
/** Single-parent ancestry; merge previews do not mutate history or resolve conflicts implicitly. */
export class BranchMergeModel {
  private commits = new Map<string, Commit>();
  constructor(private readonly options: MergeLimits = {}) {
    limits(options);
  }
  commit(id: string, parent: string | null, snapshot: Snapshot): void {
    if (typeof id !== 'string' || !id || this.commits.has(id))
      fail('invalid', 'Commit id must be unique and nonempty');
    if (parent !== null && !this.commits.has(parent)) fail('missing', 'Unknown parent');
    if (this.commits.size >= limits(this.options).snapshots)
      fail('limit', 'Snapshot capacity exceeded');
    this.commits.set(id, { id, parent, snapshot: clone(snapshot, this.options) });
  }
  get(id: string): Commit {
    const value = this.commits.get(id);
    if (!value) fail('missing', 'Unknown commit');
    return { ...value, snapshot: clone(value.snapshot, this.options) };
  }
  ancestor(left: string, right: string): string {
    const lineage = new Set<string>();
    let cursor: string | null = left;
    while (cursor !== null) {
      lineage.add(cursor);
      cursor = this.get(cursor).parent;
    }
    cursor = right;
    while (cursor !== null) {
      if (lineage.has(cursor)) return cursor;
      cursor = this.get(cursor).parent;
    }
    return fail('missing', 'Branches have no common ancestor');
  }
  preview(left: string, right: string): MergePreview & { ancestor: string } {
    const ancestor = this.ancestor(left, right);
    return {
      ancestor,
      ...previewMerge(
        this.get(ancestor).snapshot,
        this.get(left).snapshot,
        this.get(right).snapshot,
        this.options,
      ),
    };
  }
  merge(id: string, left: string, right: string): Commit {
    const preview = this.preview(left, right);
    if (preview.conflicts.length) fail('conflict', 'Explicit conflict resolution required');
    this.commit(id, left, preview.snapshot);
    return this.get(id);
  }
}
