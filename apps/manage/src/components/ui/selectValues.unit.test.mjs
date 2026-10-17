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
  const options = [{ value: 'item-a', label: 'Item A' }, { value: 'item-b' }];
  const handled = applyPastedValues('item-a item-b bogus', {
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
  assert.deepEqual(next, ['item-a', 'item-b', 'bogus']);
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
    { value: 'item-a', label: 'Item A' },
    { value: 'item-b', label: 'Item B' },
  ];
  const handled = applyPastedValues('ITEM-A item-B', {
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
  assert.deepEqual(next, ['item-a', 'item-b']);
  assert.deepEqual(ignored, []);
});

test('规范值与原文不同的命中经 onCorrected 回报：折叠变体与按名称命中都算', () => {
  let next = [];
  let ignored = [];
  let corrected = [];
  const options = [
    { value: 'item-a', label: 'Item A' },
    { value: 'USER1@EXAMPLE.COM', label: '张三·user1' },
    { value: 'staging' },
  ];
  const handled = applyPastedValues('ITEM-A 张三·user1 staging bogus', {
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
  assert.deepEqual(next, ['item-a', 'USER1@EXAMPLE.COM', 'staging', 'bogus']);
  // 折叠变体与名称命中是修正；精确命中（staging）与未命中（bogus）不报
  assert.deepEqual(corrected, [
    { from: 'ITEM-A', to: 'item-a' },
    { from: '张三·user1', to: 'USER1@EXAMPLE.COM' },
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

test('deferFold：远端核验模式下折叠命中不改写，原文收为幽灵值交给远端判定', () => {
  let next = [];
  let ignored = [];
  let corrected = [];
  // 库中同时存在 Foo/foo 时，候选页只载了 Foo——本地折叠若改写会错选另一个真实值
  const options = [{ value: 'Foo' }, { value: 'staging' }];
  const handled = applyPastedValues('foo staging', {
    values: [],
    options,
    deferFold: true,
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
  // foo 保留原文待远端核验；精确命中（staging）照常
  assert.deepEqual(next, ['foo', 'staging']);
  assert.deepEqual(ignored, ['foo']);
  assert.deepEqual(corrected, []);
});

test('折叠命中也认候选显示文案', () => {
  let next = [];
  const options = [{ value: 'user1@EXAMPLE.COM', label: '张三·user1' }];
  const handled = applyPastedValues('user1@example.com 张三·user1', {
    values: [],
    options,
    onChange: (v) => {
      next = v;
    },
  });
  assert.equal(handled, true);
  // value 折叠命中 + label 折叠命中，都归一到同一规范值
  assert.deepEqual(next, ['user1@EXAMPLE.COM']);
});

test('精确值匹配先于显示名称：同名 label 不得抢走后面的精确值', () => {
  let next = [];
  // 后端 label 会 TrimSpace 而 value 保留原文：候选页可同时存在 ' foo' 与 'foo'
  const options = [
    { value: ' foo', label: 'foo' },
    { value: 'foo', label: 'foo' },
    { value: 'other' },
  ];
  const handled = applyPastedValues('foo other', {
    values: [],
    options,
    deferFold: true,
    onChange: (v) => {
      next = v;
    },
  });
  assert.equal(handled, true);
  // foo 必须命中真实值 'foo'，不被第一项的 label 抢先改写成 ' foo'
  assert.deepEqual(next, ['foo', 'other']);
});

test('deferFold：远端核验模式下名称命中同样延后，原文送远端精确核验', () => {
  let next = [];
  let ignored = [];
  let corrected = [];
  // 库中同时存在 foo 与 ' foo'，候选页只载了 {value:' foo',label:'foo'}、真实值 foo 未加载：
  // 页内名称唯一不能证明库中无 foo，若按页内 label 改写成 ' foo'，原文永远不会进远端核验
  const options = [{ value: ' foo', label: 'foo' }, { value: 'other' }];
  const handled = applyPastedValues('foo other', {
    values: [],
    options,
    deferFold: true,
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
  // foo 保留原文待远端精确核验（远端能找到真实值 foo）；精确命中照常
  assert.deepEqual(next, ['foo', 'other']);
  assert.deepEqual(ignored, ['foo']);
  assert.deepEqual(corrected, []);
});

test('不变式：deferFold 下本地永不改写输入——输出只有原文或与原文精确相等的候选值', () => {
  // 固定种子的线性同余生成器：失败可复现
  let seed = 20261016;
  const rand = (n) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % n;
  };
  const bases = ['foo', 'Foo', 'FOO', ' foo', 'foo ', 'bar', 'Bar', 'a,b', '名称'];
  for (let round = 0; round < 500; round += 1) {
    const options = Array.from({ length: 1 + rand(6) }, () => {
      const value = bases[rand(bases.length)];
      const label = rand(2) ? bases[rand(bases.length)] : undefined;
      return label === undefined ? { value } : { value, label };
    });
    const tokens = Array.from({ length: 2 + rand(3) }, () =>
      bases[rand(bases.length)].trim()
    ).filter(Boolean);
    let next = [];
    let corrected = [];
    applyPastedValues(tokens.join(' '), {
      values: [],
      options,
      deferFold: true,
      onChange: (v) => {
        next = v;
      },
      onCorrected: (v) => {
        corrected = v;
      },
    });
    const accepted = new Set([...splitPastedValues(tokens.join(' ')), tokens.join(' ')]);
    for (const item of next)
      assert.ok(
        accepted.has(String(item)),
        `round ${round}: ${JSON.stringify({ options, tokens, next })}`
      );
    assert.deepEqual(corrected, [], `round ${round}`);
  }
});

test('多个候选同名是歧义：不猜，原文收为幽灵值标红待修', () => {
  let next = [];
  let ignored = [];
  const options = [
    { value: 'a', label: 'dup' },
    { value: 'b', label: 'dup' },
    { value: 'staging' },
  ];
  const handled = applyPastedValues('dup staging', {
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
  assert.deepEqual(next, ['dup', 'staging']);
  assert.deepEqual(ignored, ['dup']);
});

test('幽灵值的近似候选排序：大小写 > 前缀 > 包含 > 编辑距离', () => {
  const options = [
    { value: 'unrelated-xyz' },
    { value: 'ItemB-V3' },
    { value: 'itemb-lite' },
    { value: 'ITEMB' },
  ];
  const ranked = rankOptionsBySimilarity('itemb', options).map((o) => o.value);
  assert.equal(ranked[0], 'ITEMB');
  // 两个前缀命中同分，次序不限
  assert.deepEqual(new Set(ranked.slice(1, 3)), new Set(['ItemB-V3', 'itemb-lite']));
  assert.equal(ranked[3], 'unrelated-xyz');
});
