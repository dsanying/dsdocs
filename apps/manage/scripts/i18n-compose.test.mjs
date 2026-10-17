import assert from "node:assert/strict";
import test from "node:test";
import { composeLocale, normalizeLatinCase } from "./i18n-compose.mjs";
import { findOccurrences, isAtomCandidate, literalText, nestedReferences, resolveNested, segmentValue } from "./i18n-nesting.mjs";

test("嵌套引用解析：引用列表、片段切分、展开与循环检测", () => {
  assert.deepEqual(nestedReferences("自动$t(common.vocab.item){count}"), ["common.vocab.item"]);
  assert.deepEqual(segmentValue("自动$t(a){n}尾").map((s) => `${s.kind}:${s.text}`), ["literal:自动", "protected:$t(a)", "protected:{n}", "literal:尾"]);
  assert.equal(literalText("自动$t(a){n}尾"), "自动尾");
  const dict = new Map([["a", "$t(b)项"], ["b", "条"]]);
  assert.equal(resolveNested("自动$t(a)", (k) => dict.get(k)), "自动条项");
  assert.throws(() => resolveNested("$t(x)", (k) => ({ x: "$t(y)", y: "$t(x)" })[k]), /循环/);
});

test("原子判定与整词匹配：中文按子串、英文按整词且大小写不敏感，占位符与引用不作原子", () => {
  assert.equal(isAtomCandidate("条目", false), true);
  assert.equal(isAtomCandidate("池", false), false);
  assert.equal(isAtomCandidate("id", true), false);
  assert.equal(isAtomCandidate("{count} 条", false), false);
  assert.deepEqual(findOccurrences("Items and item", "item", true), [[10, 14]]);
  assert.deepEqual(findOccurrences("自动条目条目", "条目", false), [[2, 4], [4, 6]]);
});

test("拼接改写：最长词优先、引用受保护、纯拼接键；幂等", () => {
  const zh = new Map([["common.vocab.item", "条目"], ["common.objects.autoItem", "自动条目"], ["pages.x.title", "自动条目详情"], ["common.vocab.details", "详情"]]);
  const { next } = composeLocale(zh, false);
  assert.equal(next.get("common.objects.autoItem"), "自动$t(common.vocab.item)");
  assert.equal(next.get("pages.x.title"), "$t(common.objects.autoItem)$t(common.vocab.details)");
  assert.equal(composeLocale(next, false).next.get("pages.x.title"), next.get("pages.x.title"));
  const en = new Map([["common.vocab.item", "item"], ["pages.x.count", "{count} items"], ["pages.x.title", "auto item details"], ["common.vocab.details", "details"]]);
  const composedEn = composeLocale(en, true).next;
  assert.equal(composedEn.get("pages.x.title"), "auto $t(common.vocab.item) $t(common.vocab.details)");
  assert.equal(composedEn.get("pages.x.count"), "{count} items");
});

test("英文小写化：保留缩写、专有名词、句号后的新句与技术字面量", () => {
  assert.equal(normalizeLatinCase("Auto Item Details"), "auto item details");
  assert.equal(normalizeLatinCase("Sync SSO Users via Azure"), "sync SSO users via Azure");
  assert.equal(normalizeLatinCase("Search failed. Please retry"), "search failed. Please retry");
  assert.equal(normalizeLatinCase("Unique. Username@example.com"), "unique. Username@example.com");
  assert.equal(normalizeLatinCase("OpenAI-Compatible"), "OpenAI-Compatible");
});


test("全大写缩写原子保留身份，不把自然 and 改成 AND 或 us 改成 US", () => {
  const flat = new Map([["common.operator.and", "AND"], ["common.region.us", "USA"], ["common.api", "API"], ["pages.natural", "printers and devices; contact usa team"], ["pages.technical", "AND operator; USA region; API access"]]);
  const { next } = composeLocale(flat, true);
  assert.equal(next.get("pages.natural"), flat.get("pages.natural"));
  assert.equal(next.get("pages.technical"), "$t(common.operator.and) operator; $t(common.region.us) region; $t(common.api) access");
});
