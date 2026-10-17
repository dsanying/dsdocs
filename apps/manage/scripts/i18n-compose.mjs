#!/usr/bin/env node
/**
 * 字典拼接工具（FRONTEND-I18N）：同一个词只在字典里出现一次。
 * 对每种语言，凡是某个值里完整包含了另一个键的文案，就改写为 $t(那个键) 引用；
 * 最长词优先，占位符与已有引用不参与匹配。英文词条统一小写（句首大写由运行时后处理器完成）。
 *
 *   node scripts/i18n-compose.mjs          # 只报告
 *   node scripts/i18n-compose.mjs --write  # 写回字典
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findOccurrences, isAtomCandidate, isLatinLocale, literalText, resolveNested, segmentValue } from "./i18n-nesting.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const localeDir = path.join(root, "src/i18n/locales");
const write = process.argv.includes("--write");

/** 英文里保持原有大小写的专有名词（品牌、语言名、星期名）；全大写、含数字或内部大写的词自动视为专有。 */
const PROPER_NOUNS = new Set([
  "Chinese", "English", "Simplified", "Azure", "Anthropic", "OpenAI", "DSdocs", "Markdown", "Windows",
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun",
]);

function flatten(object, prefix = "", out = new Map()) {
  for (const [key, value] of Object.entries(object)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out.set(full, value);
    else if (value && typeof value === "object") flatten(value, full, out);
  }
  return out;
}

function unflatten(flat) {
  const out = {};
  for (const [key, value] of flat) {
    const parts = key.split(".");
    let cursor = out;
    for (const part of parts.slice(0, -1)) cursor = cursor[part] ??= {};
    cursor[parts.at(-1)] = value;
  }
  return out;
}

/** 英文词条小写化：只保留专有名词、缩写与句号后新句首字的大小写；含 @ 或内部点号的技术字面量不动。 */
export function normalizeLatinCase(text) {
  return text.replace(/[A-Za-z][A-Za-z0-9'’-]*(?:[.@][A-Za-z0-9'’-]+)*/g, (word, offset) => {
    if (/[@]|\w\.\w/.test(word)) return word;
    if (/[.!?]\s+$/.test(text.slice(0, offset))) return word;
    if (/^[A-Z0-9]+$/.test(word) && word.length >= 2) return word;
    if (/\d/.test(word)) return word;
    if (/^[A-Z][a-z]+[A-Z]/.test(word) || /^[a-z]+[A-Z]/.test(word)) return word;
    if (PROPER_NOUNS.has(word)) return word;
    if (/^[A-Z]/.test(word) && /^[a-z0-9'’-]*$/.test(word.slice(1))) return word.charAt(0).toLowerCase() + word.slice(1);
    return word;
  });
}

/**
 * 对单个语言的扁平字典做拼接改写；返回 { next, replaced }。
 * 原子按文案长度降序，逐个在字面片段里替换；被替换出的引用受保护，后续更短的原子只在剩余字面里匹配。
 */
export function composeLocale(flat, latin) {
  const atoms = [...flat].filter(([, value]) => isAtomCandidate(value, latin))
    .map(([key, value]) => ({ key, text: value }))
    .sort((a, b) => b.text.length - a.text.length || a.key.localeCompare(b.key));
  const next = new Map();
  let replaced = 0;
  for (const [key, value] of flat) {
    const ownText = latin ? value.toLowerCase() : value;
    const usable = atoms.filter((atom) => atom.key !== key && (latin ? atom.text.toLowerCase() : atom.text) !== ownText);
    const rewritten = segmentValue(value)
      .map((segment) => segment.kind === "literal" ? composeLiteral(segment.text, usable, 0, latin, () => { replaced += 1; }) : segment.text)
      .join("");
    next.set(key, rewritten);
  }
  return { next, replaced };
}

function composeLiteral(text, atoms, from, latin, onReplace) {
  for (let index = from; index < atoms.length; index += 1) {
    const atom = atoms[index];
    const hits = findOccurrences(text, atom.text, latin);
    if (!hits.length) continue;
    let out = "";
    let cursor = 0;
    for (const [start, end] of hits) {
      if (start < cursor) continue;
      out += composeLiteral(text.slice(cursor, start), atoms, index + 1, latin, onReplace) + `$t(${atom.key})`;
      cursor = end;
      onReplace();
    }
    return out + composeLiteral(text.slice(cursor), atoms, index + 1, latin, onReplace);
  }
  return text;
}

function main() {
  for (const file of fs.readdirSync(localeDir).filter((name) => name.endsWith(".json"))) {
    const locale = file.replace(/\.json$/, "");
    const latin = isLatinLocale(locale);
    const target = path.join(localeDir, file);
    const flat = flatten(JSON.parse(fs.readFileSync(target, "utf8")));
    // 先展开旧引用得到纯文案，再统一小写、再重新拼接（幂等）
    const plain = new Map([...flat].map(([key, value]) => [key, resolveNested(value, (k) => flat.get(k))]));
    const normalized = new Map([...plain].map(([key, value]) => [key, latin ? normalizeLatinCase(value) : value]));
    const { next, replaced } = composeLocale(normalized, latin);
    const literalBefore = [...normalized.values()].reduce((sum, value) => sum + literalText(value).length, 0);
    const literalAfter = [...next.values()].reduce((sum, value) => sum + literalText(value).length, 0);
    const pure = [...next.values()].filter((value) => literalText(value).trim() === "").length;
    console.log(`${locale}: 引用替换 ${replaced} 处，字面字符 ${literalBefore} -> ${literalAfter}，纯拼接键 ${pure}/${next.size}`);
    if (write) fs.writeFileSync(target, `${JSON.stringify(unflatten(next), null, 2)}\n`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
