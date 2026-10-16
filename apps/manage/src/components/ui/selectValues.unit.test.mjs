import assert from 'node:assert/strict';
import test from 'node:test';

import { applyPastedValues, rankOptionsBySimilarity, splitPastedValues } from './selectValues.ts';

test('粘贴文本按空白与中英文标点分词，去空项去重', () => {
  assert.deepEqual(splitPastedValues('1@qq.com  2@qq.com'), ['1@qq.com', '2@qq.com']);
  assert.deepEqual(splitPastedValues('a@x.com\nb@x.com\tc@x.com'), [
    'a@x.com',
    'b@x.com',
    'c@x.com',
  ]);
  assert.deepEqual(splitPastedValues('a,b；c、d，e;f'), ['a', 'b', 'c', 'd', 'e', 'f']);
  assert.deepEqual(splitPastedValues(' a ,  a ,, '), ['a']);
  assert.deepEqual(splitPastedValues('single-value'), ['single-value']);
});

test('单个值不接管粘贴：返回 false 由默认粘贴进入输入框', () => {
  assert.equal(applyPastedValues('one-value', { values: [], options: [] }), false);
  assert.equal(applyPastedValues('  ', { values: [], options: [] }), false);
});

test('freeInput 全量收下且不重复', () => {
  let next = [];
  const handled = applyPastedValues('a@x.com b@x.com a@x.com', {
    values: ['keep'],
    freeInput: true,
    onChange: (v) => {
      next = v;
    },
  });
  assert.equal(handled, true);
  assert.deepEqual(next, ['keep', 'a@x.com', 'b@x.com']);
});

test('候选制逐项匹配值或名称，未命中交给 onUnknown', () => {
  let next = [];
  let ignored = [];
  const options = [{ value: 'gpt-4o', label: 'GPT 4o' }, { value: 'glm-5' }];
  const handled = applyPastedValues('gpt-4o glm-5 bogus', {
    values: [],
    options,
    onChange: (v) => {
      next = v;
    },
    onUnknown: (v) => {
      ignored = v;
    },
  });
  assert.equal(handled, true);
  // 未命中项进已选区标红待修正，不静默丢弃
  assert.deepEqual(next, ['gpt-4o', 'glm-5', 'bogus']);
  assert.deepEqual(ignored, ['bogus']);
});

test('候选值本身含分隔符时整串优先匹配，不被拆碎', () => {
  let next = [];
  const options = [{ value: 'cn=ops,dc=x', label: 'CN=ops,DC=x' }];
  const handled = applyPastedValues('cn=ops,dc=x', {
    values: [],
    options,
    onChange: (v) => {
      next = v;
    },
  });
  assert.equal(handled, true);
  assert.deepEqual(next, ['cn=ops,dc=x']);
});

test('候选制仅大小写差异的粘贴自动校正为唯一规范值', () => {
  let next = [];
  let ignored = [];
  const options = [
    { value: 'gpt-4o', label: 'GPT 4o' },
    { value: 'DeepSeek-V3', label: 'DeepSeek V3' },
  ];
  const handled = applyPastedValues('GPT-4O deepseek-v3', {
    values: [],
    options,
    onChange: (v) => {
      next = v;
    },
    onUnknown: (v) => {
      ignored = v;
    },
  });
  assert.equal(handled, true);
  // 两个粘贴值各有唯一折叠命中：自动校正为候选规范值，不算未命中
  assert.deepEqual(next, ['gpt-4o', 'DeepSeek-V3']);
  assert.deepEqual(ignored, []);
});

test('规范值与原文不同的命中经 onCorrected 回报：折叠变体与按名称命中都算', () => {
  let next = [];
  let ignored = [];
  let corrected = [];
  const options = [
    { value: 'gpt-4o', label: 'GPT 4o' },
    { value: 'USER@EXAMPLE.COM', label: '测试用户·USER' },
    { value: 'staging' },
  ];
  const handled = applyPastedValues('GPT-4O 测试用户·user staging bogus', {
    values: [],
    options,
    onChange: (v) => {
      next = v;
    },
    onUnknown: (v) => {
      ignored = v;
    },
    onCorrected: (v) => {
      corrected = v;
    },
  });
  assert.equal(handled, true);
  assert.deepEqual(next, ['gpt-4o', 'USER@EXAMPLE.COM', 'staging', 'bogus']);
  // 折叠变体与名称命中是修正；精确命中（staging）与未命中（bogus）不报
  assert.deepEqual(corrected, [
    { from: 'GPT-4O', to: 'gpt-4o' },
    { from: '测试用户·user', to: 'USER@EXAMPLE.COM' },
  ]);
  assert.deepEqual(ignored, ['bogus']);
});

test('折叠命中多个候选是歧义：不猜，原文收为幽灵值标红待修', () => {
  let next = [];
  let ignored = [];
  const options = [{ value: 'Prod' }, { value: 'prod' }, { value: 'staging' }];
  const handled = applyPastedValues('PROD staging', {
    values: [],
    options,
    onChange: (v) => {
      next = v;
    },
    onUnknown: (v) => {
      ignored = v;
    },
  });
  assert.equal(handled, true);
  // PROD 折叠命中 Prod/prod 两个候选：歧义不猜，保留原文标红由"近似候选"修正
  assert.deepEqual(next, ['PROD', 'staging']);
  assert.deepEqual(ignored, ['PROD']);
});

test('折叠命中也认候选显示文案', () => {
  let next = [];
  const options = [{ value: 'user@EXAMPLE.COM', label: '测试用户·USER' }];
  const handled = applyPastedValues('user@example.com 测试用户·user', {
    values: [],
    options,
    onChange: (v) => {
      next = v;
    },
  });
  assert.equal(handled, true);
  // value 折叠命中 + label 折叠命中，都归一到同一规范值
  assert.deepEqual(next, ['user@EXAMPLE.COM']);
});

test('幽灵值的近似候选排序：大小写 > 前缀 > 包含 > 编辑距离', () => {
  const options = [
    { value: 'unrelated-xyz' },
    { value: 'DeepSeek-V3' },
    { value: 'deepseek-lite' },
    { value: 'DEEPSEEK' },
  ];
  const ranked = rankOptionsBySimilarity('deepseek', options).map((o) => o.value);
  assert.equal(ranked[0], 'DEEPSEEK');
  // 两个前缀命中同分，次序不限
  assert.deepEqual(new Set(ranked.slice(1, 3)), new Set(['DeepSeek-V3', 'deepseek-lite']));
  assert.equal(ranked[3], 'unrelated-xyz');
});
