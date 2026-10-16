/**
 * 多选框的粘贴分词与候选匹配：纯逻辑层，不引入组件与样式依赖，供 MultiSelect / FilterSelect 共用。
 */

/** 粘贴到多选框的列表文本分隔符：空白（空格/换行/Tab）与中英文逗号、分号、顿号；连续分隔符不产生空项。 */
export const PASTE_VALUE_SEPARATORS = /[\s,，;；、]+/u;

/** 粘贴文本分词：去首尾空白、去空项、去重。 */
export function splitPastedValues(text: string): string[] {
  return [
    ...new Set(
      text
        .split(PASTE_VALUE_SEPARATORS)
        .map((item) => item.trim())
        .filter(Boolean)
    ),
  ];
}

export type PasteOption = { value?: unknown; label?: unknown };

/** 粘贴命中的规范化修正：from 是输入原文，to 是候选规范值（仅大小写差异或按名称命中）。 */
export type PasteCorrection = { from: string; to: string };

/** 候选值或显示文案命中（候选的值与名称都接受粘贴/匹配输入）：先精确匹配，落空再做
 * 大小写折叠匹配——唯一变体自动校正为候选规范值；多个候选只差大小写属歧义，不猜，
 * 收为幽灵值标红由“近似候选”修正。远端未加载的变体由 useRemoteOptions 的折叠核验兜底。 */
function findOption(
  options: readonly PasteOption[] | undefined,
  probe: string
): PasteOption | undefined {
  const list = options ?? [];
  const exact = list.find((option) => String(option.value) === probe || option.label === probe);
  if (exact) return exact;
  const lower = probe.toLowerCase();
  const folded = new Map<string, PasteOption>();
  for (const option of list) {
    for (const field of [String(option.value ?? ''), String(option.label ?? '')]) {
      if (field && field.toLowerCase() === lower) {
        folded.set(String(option.value), option);
        break;
      }
    }
  }
  return folded.size === 1 ? [...folded.values()][0] : undefined;
}

/** 两个词项的编辑距离：用于幽灵值的近似候选排序（输入很短，DP 足够快）。 */
function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const next = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = prev[j];
      prev[j] = next;
    }
  }
  return prev[b.length];
}

/**
 * 幽灵值（不在候选中的已选值）的近似候选排序：同名（仅大小写差异）> 前缀 > 包含 > 编辑距离。
 * 供红色标签的"点击替换"列表用——全量候选按近似度排，无近似时列表仍可浏览修正。
 */
export function rankOptionsBySimilarity(
  probe: string,
  options: readonly PasteOption[]
): PasteOption[] {
  const lower = probe.toLowerCase();
  const score = (option: PasteOption): number => {
    let best = Infinity;
    for (const field of [String(option.value), String(option.label ?? '')]) {
      const target = field.toLowerCase();
      if (!target) continue;
      if (target === lower) best = Math.min(best, 0);
      else if (target.startsWith(lower) || lower.startsWith(target)) best = Math.min(best, 1);
      else if (target.includes(lower) || lower.includes(target)) best = Math.min(best, 2);
      else best = Math.min(best, 3 + editDistance(lower, target));
    }
    return best;
  };
  return [...options].sort((left, right) => score(left) - score(right));
}

/**
 * 把粘贴的一段列表文本切成多个已选值：文本含两个以上分隔符项才接管（单个值走默认粘贴进输入框）；
 * freeInput 全量收下；候选制先整串匹配（候选值本身可能含空格/逗号），匹配不上才逐项，
 * 未命中项作为幽灵值收进已选区标红待修正，并经 onUnknown 交给调用方提示。
 * 命中项的规范值与输入原文不同（仅大小写差异或按名称命中）时经 onCorrected 回报，
 * 让"自动修正"与"标红待修正"分成两类提示，不混在同一条通知里。
 * 已处理返回 true，调用方据此 preventDefault。
 */
export function applyPastedValues<T = string>(
  text: string,
  params: {
    values: readonly T[];
    options?: readonly PasteOption[];
    freeInput?: boolean;
    onChange?: (next: T[]) => void;
    onUnknown?: (ignored: string[]) => void;
    onCorrected?: (fixes: readonly PasteCorrection[]) => void;
  }
): boolean {
  const tokens = splitPastedValues(text);
  if (tokens.length < 2) return false;
  const next = [...params.values];
  const push = (item: T) => {
    if (!next.includes(item)) next.push(item);
  };
  const corrected: PasteCorrection[] = [];
  // 命中项保留候选值本身的类型（数值候选仍是数值）；原文与规范值不同才算修正
  const pushHit = (probe: string, hit: PasteOption) => {
    push(hit.value as T);
    if (String(hit.value) !== probe) corrected.push({ from: probe, to: String(hit.value) });
  };
  if (params.freeInput) {
    for (const token of tokens) push(token as T);
  } else {
    const whole = findOption(params.options, text.trim());
    if (whole) pushHit(text.trim(), whole);
    else {
      const unknown: string[] = [];
      for (const token of tokens) {
        const hit = findOption(params.options, token);
        if (hit) pushHit(token, hit);
        else {
          unknown.push(token);
          // 未命中项不丢弃：以原文收进已选区标红，点击标签可按近似候选修正
          push(token as T);
        }
      }
      if (unknown.length) params.onUnknown?.(unknown);
    }
  }
  if (corrected.length) params.onCorrected?.(corrected);
  params.onChange?.(next);
  return true;
}
