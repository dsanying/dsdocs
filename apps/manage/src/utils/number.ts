/** 全局小数位上限：所有面向用户的数值最多保留三位小数。 */
export const MAX_FRACTION_DIGITS = 3;

const clampDigits = (digits: number) =>
  Math.min(MAX_FRACTION_DIGITS, Math.max(0, Math.trunc(digits)));

const toSafeNumber = (value: number | string | null | undefined) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
};

/** 固定小数位展示（默认三位，上限三位）；业务代码不得直接调用 toFixed。 */
export function formatDecimal(
  value: number | string | null | undefined,
  fractionDigits = MAX_FRACTION_DIGITS
): string {
  return toSafeNumber(value).toFixed(clampDigits(fractionDigits));
}

/**
 * 通用数值展示：数字或数字字符串裁到最多三位小数并去掉多余的 0，不分组、不补零
 * （ID、编号等整数原样输出）；非数值原样返回。表格单元格与字段网格自动套用。
 */
export function formatNumber(value: unknown): string {
  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? String(Number(value.toFixed(MAX_FRACTION_DIGITS)))
      : String(value);
  }
  if (typeof value === 'string' && /^-?\d+\.\d{4,}$/.test(value.trim())) {
    return String(Number(Number(value).toFixed(MAX_FRACTION_DIGITS)));
  }
  return typeof value === 'string' ? value : String(value ?? '');
}

/** 整数按 locale 分组展示（请求数、Token 数等）。 */
export function formatInteger(value: number | string | null | undefined, locale?: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(toSafeNumber(value));
}

/** 百分比统一一位小数。 */
export function formatPercent(
  value: number | string | null | undefined,
  fractionDigits = 1
): string {
  return `${formatDecimal(value, fractionDigits)}%`;
}

/** 金额币种符号：展示（formatCurrency）与金额输入框前缀共用。 */
export const CURRENCY_SYMBOL = '￥';

/** 精确十进制串转科学计数：只舍入展示尾数，不经过浮点数或改写原始金额。 */
const smallAmountNotation = (value: number | string | null | undefined): string | undefined => {
  const match = String(value ?? '')
    .trim()
    .match(/^([+-]?)(\d*)\.?([0-9]*)(?:[eE]([+-]?\d+))?$/);
  if (!match || !(match[2] + match[3])) return undefined;
  const digits = match[2] + match[3];
  const first = digits.search(/[1-9]/);
  if (first < 0) return undefined;
  let exponent = match[2].length - first - 1 + Number(match[4] ?? 0);
  if (!Number.isSafeInteger(exponent) || exponent >= -3) return undefined;
  const significant = digits.slice(first);
  let mantissa = Number(significant.slice(0, 4).padEnd(4, '0'));
  if (Number(significant[4] ?? 0) >= 5) mantissa += 1;
  if (mantissa === 10000) {
    mantissa = 1000;
    exponent += 1;
  }
  return `${match[1] === '-' ? '-' : ''}${mantissa / 1000}e${exponent}`;
};

/**
 * 精确十进制串的展示收口：小数超过三位时按全局上限裁位——小于 0.001 的非零值转科学计数
 * 不被舍成零（`0.000001` → `1e-6`），其余按三位小数四舍五入（`1.23456789` → `1.235`）。
 * 输入是已渲染好的十进制串（含 `perMillionTokens` 这类不走浮点的计算结果），非数值原样返回。
 */
export function formatPreciseDecimal(rendered: string): string {
  if (!/\.\d{4,}/.test(rendered)) return rendered;
  const small = smallAmountNotation(rendered);
  if (small !== undefined) return small;
  const amount = Number(rendered);
  return Number.isFinite(amount) ? String(Number(amount.toFixed(MAX_FRACTION_DIGITS))) : rendered;
}

/** 金额最多三位小数；小于 0.001 的非零金额使用科学计数，避免被展示成零。 */
export function formatAmount(
  value: number | string | null | undefined,
  locale?: string,
  minimumFractionDigits = 0
): string {
  return (
    smallAmountNotation(value) ??
    new Intl.NumberFormat(locale, {
      minimumFractionDigits: clampDigits(minimumFractionDigits),
      maximumFractionDigits: MAX_FRACTION_DIGITS,
    }).format(toSafeNumber(value))
  );
}

/** 金额统一按 locale 分组，保留两到三位小数，摘要条与信息网格共用。 */
export function formatCurrency(value: number | string | null | undefined, locale?: string): string {
  return `${CURRENCY_SYMBOL}${formatAmount(value, locale, 2)}`;
}

/** 大数紧凑展示的统一实现（K/M/B），避免各处缩写规则不一致。 */
export function formatCompactNumber(value: number, fractionDigits = 1): string {
  if (Number.isNaN(value)) return '0';
  const digits = clampDigits(fractionDigits);
  if (Math.abs(value) >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(digits)}B`;
  }
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(digits)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(digits)}K`;
  }
  const formatted = formatDecimal(value, digits);
  return formatted.includes('.') ? formatted.replace(/0+$/, '').replace(/\.$/, '') : formatted;
}
