import {
  semanticDiff,
  previewMerge,
  BranchMergeModel,
  BranchMergeError,
} from '@lp-labs/branch-merge-model';
const publicAPI = [semanticDiff, previewMerge, BranchMergeModel, BranchMergeError];
const apiCount: number = publicAPI.length;
void apiCount;
const history = new BranchMergeModel();
history.commit('a', null, { x: 1 });
const id: string = history.get('a').id;
void id;
