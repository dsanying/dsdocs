#!/usr/bin/env node
/**
 * 一次性迁移：被其它文案引用（$t）的词条必须住在 common.vocab 下。
 * 先在内存里做一次拼接，找出所有被引用的非 common 键，按英文文案生成 camelCase 名迁移到 common.vocab.<name>，
 * 同步改写字典、源码里的字面 key 与动态 key 登记。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { composeLocale, normalizeLatinCase } from "./i18n-compose.mjs";
import { rewriteLiteralKeys } from "./i18n-rewrite-keys.mjs";
import { nestedReferences, resolveNested } from "./i18n-nesting.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const localeDir = path.join(root, "src/i18n/locales");
const locales = fs.readdirSync(localeDir).filter((name) => name.endsWith(".json")).map((name) => name.replace(/\.json$/, ""));

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
const camel = (text) => {
  const words = text.replace(/[^A-Za-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  return words.map((word, index) => {
    const lower = /^[A-Z0-9]+$/.test(word) ? word.toLowerCase() : word.toLowerCase();
    return index === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
  }).join("");
};

const flats = new Map(locales.map((locale) => {
  const flat = flatten(JSON.parse(fs.readFileSync(path.join(localeDir, `${locale}.json`), "utf8")));
  const plain = new Map([...flat].map(([key, value]) => [key, resolveNested(value, (k) => flat.get(k))]));
  return [locale, plain];
}));

// 内存拼接，收集被引用键
const referenced = new Set();
for (const locale of locales) {
  const latin = !/^zh/i.test(locale);
  const source = new Map([...flats.get(locale)].map(([key, value]) => [key, latin ? normalizeLatinCase(value) : value]));
  const { next } = composeLocale(source, latin);
  for (const value of next.values()) for (const ref of nestedReferences(value)) referenced.add(ref);
}

const latinLocale = locales.find((locale) => !/^zh/i.test(locale));
const existing = new Set(flats.get(locales[0]).keys());
const rename = new Map();
for (const key of [...referenced].sort()) {
  if (key.startsWith("common.")) continue;
  const base = camel(flats.get(latinLocale).get(key) ?? "") || camel(key.split(".").slice(-2).join(" "));
  let name = `common.vocab.${base}`;
  let counter = 2;
  while (existing.has(name) || [...rename.values()].includes(name)) name = `common.vocab.${base}${counter++}`;
  rename.set(key, name);
}
console.log(`迁移 ${rename.size} 个词条到 common.vocab`);

// 字典改写
for (const locale of locales) {
  const flat = flats.get(locale);
  const next = new Map();
  for (const [key, value] of flat) next.set(rename.get(key) ?? key, value);
  fs.writeFileSync(path.join(localeDir, `${locale}.json`), `${JSON.stringify(unflatten(next), null, 2)}\n`);
}

// 源码与动态 key 登记改写（字面 key）
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(?:tsx?|json)$/.test(entry.name) && !full.includes("/locales/")) out.push(full);
  }
  return out;
}
let touched = 0;
for (const file of walk(path.join(root, "src"))) {
  let text = fs.readFileSync(file, "utf8");
  const before = text;
  text = rewriteLiteralKeys(text, rename, file);
  if (text !== before) { fs.writeFileSync(file, text); touched += 1; }
}
console.log(`改写源码文件 ${touched} 个`);
for (const [from, to] of rename) console.log(`${from} -> ${to}`);
