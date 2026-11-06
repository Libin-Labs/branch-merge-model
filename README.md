# @lp-labs/branch-merge-model

Bounded structured snapshots with single-parent ancestry and explicit three-way merge previews.

Original independent MIT TypeScript implementation with **zero runtime/peer dependencies**. ESM and CommonJS with separate declarations, Node 18+ (browser use when adapters/APIs are available). Development dependencies are not consumer runtime dependencies.

## Install

```sh
npm install @lp-labs/branch-merge-model
```

## Complete example

```js
import assert from 'node:assert/strict';
import {
  semanticDiff,
  previewMerge,
  BranchMergeModel,
  BranchMergeError,
} from '@lp-labs/branch-merge-model';
const history = new BranchMergeModel();
history.commit('base', null, { a: 1, b: 1 });
history.commit('left', 'base', { a: 2, b: 1 });
history.commit('right', 'base', { a: 1, b: 2 });
const preview = history.preview('left', 'right');
assert.equal(preview.ancestor, 'base');
assert.deepEqual(preview.snapshot, { a: 2, b: 2 });
assert.equal(semanticDiff({ a: 1 }, { a: 2 }).length, 1);
assert.equal(previewMerge({ a: 1 }, { a: 2 }, { a: 3 }).conflicts.length, 1);
```

CommonJS exposes the same API: `const api = require('@lp-labs/branch-merge-model')`.

## Scope, customization and performance

Finite JSON plain-object snapshots; arrays are atomic values rather than element merges. Conflicts retain ancestor value in preview; never auto-pick one side. Single-parent commits only: merge commit records left parent, not a DAG; subsequent ancestry must be handled accordingly. Defaults maxNodes 100,000, maxDepth 64, maxSnapshots 1,024; no disk storage. IDs unique. O(snapshot size plus traversal/diff); repeated ancestor get clones snapshots. Caller owns semantic meaning and explicit conflict resolutions.

Configure explicit limits, clocks, policies and adapters through the API below. Error classes and standard TypeError/RangeError reject malformed input; adapter/handler errors propagate. Await asynchronous methods and handle rejection in your application; no success-shaped fallback on failed work. Inputs must be trusted ordinary data, not hostile proxies; adapters must meet documented atomicity, isolation and ownership contracts. This package never publishes data, loads external code or starts background services at import time.

## API reference

The complete exported TypeScript contract (including option defaults discussed above, method return shapes, and error codes) is included below. TypeScript users import interfaces using `import type`; JavaScript users pass matching ordinary objects. Signature optionals indicate intentionally optional fields, not silent recovery.

```ts
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | {
      [key: string]: JsonValue;
    };
export type Snapshot = {
  [key: string]: JsonValue;
};
export type MergeErrorCode = 'invalid' | 'limit' | 'missing' | 'conflict';
export declare class BranchMergeError extends Error {
  readonly code: MergeErrorCode;
  constructor(code: MergeErrorCode, message: string);
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
export declare function semanticDiff(
  before: Snapshot,
  after: Snapshot,
  options?: MergeLimits,
): FieldChange[];
export declare function previewMerge(
  base: Snapshot,
  left: Snapshot,
  right: Snapshot,
  options?: MergeLimits,
): MergePreview;
export interface Commit {
  id: string;
  parent: string | null;
  snapshot: Snapshot;
}
/** Single-parent ancestry; merge previews do not mutate history or resolve conflicts implicitly. */
export declare class BranchMergeModel {
  private readonly options;
  private commits;
  constructor(options?: MergeLimits);
  commit(id: string, parent: string | null, snapshot: Snapshot): void;
  get(id: string): Commit;
  ancestor(left: string, right: string): string;
  preview(
    left: string,
    right: string,
  ): MergePreview & {
    ancestor: string;
  };
  merge(id: string, left: string, right: string): Commit;
}
```

## Support

If this library is useful to you, consider supporting its maintenance with a [donation via PayPal](https://www.paypal.me/LibinPrasanth).

## Author

Created by [Libin Prasanth](https://www.linkedin.com/in/libinprasanth/). Connect on LinkedIn for updates and discussion.
