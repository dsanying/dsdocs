/**
 * i18next 嵌套引用（$t(key)）的共享解析：字典里的复合文案由原子词条拼接而成，
 * 门禁、清理与拼接工具都通过这里识别引用、展开文案与切分受保护片段。
 */
export const NESTING_RE = /\$t\(([^()]+?)\)/g;
export const PLACEHOLDER_RE = /\{[A-Za-z_$][\w$]*\}/g;

/** 值里引用到的其它键（去重、按出现顺序）。 */
export function nestedReferences(value) {
  return [...new Set([...String(value ?? "").matchAll(NESTING_RE)].map((match) => match[1].trim()))];
}

/** 把值切成 literal / protected（占位符与嵌套引用）片段，便于只在字面片段上做匹配或替换。 */
export function segmentValue(value) {
  const text = String(value ?? "");
  const protectedRanges = [];
  for (const re of [NESTING_RE, PLACEHOLDER_RE]) {
    for (const match of text.matchAll(re)) protectedRanges.push([match.index, match.index + match[0].length]);
  }
  protectedRanges.sort((a, b) => a[0] - b[0]);
  const segments = [];
  let cursor = 0;
  for (const [start, end] of protectedRanges) {
    if (start < cursor) continue;
    if (start > cursor) segments.push({ kind: "literal", text: text.slice(cursor, start) });
    segments.push({ kind: "protected", text: text.slice(start, end) });
    cursor = end;
  }
  if (cursor < text.length) segments.push({ kind: "literal", text: text.slice(cursor) });
  return segments;
}

/** 展开嵌套引用得到最终文案（占位符原样保留）；循环引用抛错。 */
export function resolveNested(value, lookup, stack = []) {
  return String(value ?? "").replace(NESTING_RE, (whole, rawKey) => {
    const key = rawKey.trim();
    if (stack.includes(key)) throw new Error(`i18n 嵌套引用循环：${[...stack, key].join(" -> ")}`);
    const target = lookup(key);
    if (typeof target !== "string") return whole;
    return resolveNested(target, lookup, [...stack, key]);
  });
}

/** 值的字面部分（去掉引用与占位符后的纯文本）。 */
export function literalText(value) {
  return segmentValue(value).filter((segment) => segment.kind === "literal").map((segment) => segment.text).join("");
}

export const isLatinLocale = (locale) => !/^zh/i.test(locale);

const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 词条是否可作为原子被其它值引用：没有占位符、没有嵌套、达到最小长度（中文两字，拉丁语三个字母）。 */
export function isAtomCandidate(value, latin) {
  const text = String(value);
  if (/\{|\$t\(/.test(text)) return false;
  return latin ? /[\p{L}]{3,}/u.test(text) : [...text].length >= 2;
}

/** 在拉丁语里按整词匹配（全大写缩写严格大小写，其余大小写不敏感）；中文按子串匹配。返回 [start, end] 区间。 */
export function findOccurrences(haystack, needle, latin) {
  if (latin) {
    const flags = /^[A-Z]{2,}$/.test(needle) ? "gu" : "giu";
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(needle)}(?![\\p{L}\\p{N}])`, flags);
    return [...haystack.matchAll(re)].map((match) => [match.index, match.index + match[0].length]);
  }
  const hits = [];
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    hits.push([index, index + needle.length]);
    index = haystack.indexOf(needle, index + needle.length);
  }
  return hits;
}
