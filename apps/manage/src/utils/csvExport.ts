import { downloadBlob } from './download';
import { formatCompactDate } from './dateTime.ts';

// 本模块统一处理前端数据面板的 CSV 生成与下载，避免各页面重复拼接转义逻辑。
// CsvCell 表示 CSV 单元格可接受的基础值，null/undefined 会导出为空字符串。
export type CsvCell = string | number | boolean | null | undefined;

// CsvSection 表示同一个 CSV 文件中的一个数据分区，用空行与其它分区分隔。
export interface CsvSection {
  title: string;
  headers: string[];
  rows: CsvCell[][];
}

export interface CsvColumn<T> {
  header: string;
  value: (item: T) => CsvCell;
}

// UTF8_BOM 用于让 Windows Excel 按 UTF-8 打开中文 CSV。
const UTF8_BOM = '\uFEFF';
const EXCEL_TEXT_PREFIX = "'";
const FORMULA_PREFIX_PATTERN = /^[=+@\t\r-]/;
const LONG_NUMBER_PATTERN = /^\d{12,}$/;
const LEADING_ZERO_NUMBER_PATTERN = /^0\d+$/;
const DATE_LIKE_PATTERN =
  /^(?:\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})(?:[ T]\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

// formatCsvDate 将 RFC3339 或日期时间字符串压缩为 YYMMDD，避免下载文件名出现 Windows 非法字符。
export const formatCsvDate = (value: string) => formatCompactDate(value);

// shouldForceExcelText 识别 Excel 会自动解释或改写的字符串，仅这些字符串需要加文本前缀。
const shouldForceExcelText = (value: string) =>
  FORMULA_PREFIX_PATTERN.test(value) ||
  LONG_NUMBER_PATTERN.test(value) ||
  LEADING_ZERO_NUMBER_PATTERN.test(value) ||
  DATE_LIKE_PATTERN.test(value);

const normalizeCsvValue = (cell: Exclude<CsvCell, null | undefined>) => {
  const value = String(cell);
  // number/boolean 保持可计算文本；其它后端字符串统一做 Excel 自动解释防护。
  return typeof cell !== 'number' &&
    typeof cell !== 'boolean' &&
    value !== '' &&
    shouldForceExcelText(value)
    ? `${EXCEL_TEXT_PREFIX}${value}`
    : value;
};

/**
 * formatCsvCell 使用 RFC4180 引号转义，并在包含逗号、双引号或换行时强制加引号。
 * CSV 行分隔统一使用 CRLF，优先兼容 Windows Excel，同时保留 LibreOffice/pandas 可读性。
 */
const formatCsvCell = (cell: CsvCell) => {
  if (cell == null) {
    return '';
  }

  const value = normalizeCsvValue(cell);
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
};

const buildSectionLines = (section: CsvSection) =>
  [[section.title], section.headers, ...section.rows].map((row) =>
    row.map(formatCsvCell).join(',')
  );

// buildCsvContent 将多个数据分区序列化为单个 CSV 文本，并用 CRLF 分隔行以兼容 Excel/Windows。
const buildCsvContent = (sections: CsvSection[]) =>
  sections
    .filter((section) => section.rows.length > 0)
    .flatMap((section, index) => [...(index > 0 ? [''] : []), ...buildSectionLines(section)])
    .join('\r\n');

// hasExportableCsvRows 判断是否存在真实数据行，避免只下载 BOM 或空标题。
const hasExportableCsvRows = (sections: CsvSection[]) =>
  sections.some((section) => section.title !== 'metadata' && section.rows.length > 0);

// mapCsvSection 将同形的 headers + rows.map(...) 收敛为声明式列配置，减少页面导出模板重复。
export const mapCsvSection = <T>(
  title: string,
  columns: CsvColumn<T>[],
  rows: T[]
): CsvSection => ({
  title,
  headers: columns.map((column) => column.header),
  rows: rows.map((item) => columns.map((column) => column.value(item))),
});

// maskCsvIdentifier 脱敏 CSV 中的 UPN/owner 标识，降低离线文件扩散后的 PII 暴露面。
export const maskCsvIdentifier = (value: CsvCell) => {
  if (value == null) {
    return value;
  }

  const text = String(value).trim();
  if (text === '') {
    return '';
  }

  const [local, domain] = text.split('@');
  const visiblePrefix = local.slice(0, Math.min(3, local.length));
  const maskedLocal = `${visiblePrefix}***`;

  return domain ? `${maskedLocal}@${domain}` : `${visiblePrefix}***`;
};

// maskCsvSensitiveText 脱敏姓名、部门、身份、配额池等识别性文本，避免离线报表暴露组织结构。
export const maskCsvSensitiveText = (value: CsvCell) => {
  if (value == null) {
    return value;
  }

  const text = String(value).trim();
  if (text === '') {
    return '';
  }

  if (text.includes('@')) {
    return maskCsvIdentifier(text);
  }

  const chars = Array.from(text);
  const visibleCount = chars.length <= 2 ? 1 : 2;
  return `${chars.slice(0, visibleCount).join('')}***`;
};

// downloadCsv 在浏览器中触发 CSV 文件下载，文件带 UTF-8 BOM 以兼容 Excel 中文显示。
export const downloadCsv = (filename: string, sections: CsvSection[]) => {
  if (!hasExportableCsvRows(sections)) {
    throw new Error('CSV 没有可导出的数据');
  }

  const content = buildCsvContent(sections);
  const blob = new Blob([UTF8_BOM, content], {
    type: 'text/csv;charset=utf-8',
  });
  downloadBlob(filename.endsWith('.csv') ? filename : `${filename}.csv`, blob);
};
