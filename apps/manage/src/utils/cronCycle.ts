import { CronExpressionParser } from 'cron-parser';
import { now } from './dateTime.ts';
import cronstrue from 'cronstrue';
import 'cronstrue/locales/zh_CN.js';

export type CronCycleLanguage = 'zh-CN' | 'en-US';

const STANDARD_DESCRIPTORS = new Set([
  '@yearly',
  '@annually',
  '@monthly',
  '@weekly',
  '@daily',
  '@midnight',
  '@hourly',
]);
const GO_DURATION_PART = /(?:\d+(?:\.\d*)?|\.\d+)(?:ns|us|µs|μs|ms|s|m|h)/gy;
const GO_DURATION_UNITS: Record<string, bigint> = {
  ns: 1n,
  us: 1_000n,
  µs: 1_000n,
  μs: 1_000n,
  ms: 1_000_000n,
  s: 1_000_000_000n,
  m: 60_000_000_000n,
  h: 3_600_000_000_000n,
};
const MAX_DURATION = 9_223_372_036_854_775_807n;

function parseGoDuration(value: string): boolean {
  const sign = value.startsWith('+') || value.startsWith('-') ? value[0] : '';
  const unsigned = sign ? value.slice(1) : value;
  if (unsigned === '0') return true;
  if (!unsigned) return false;

  let position = 0;
  let total = 0n;
  GO_DURATION_PART.lastIndex = 0;
  for (
    let match = GO_DURATION_PART.exec(unsigned);
    match;
    match = GO_DURATION_PART.exec(unsigned)
  ) {
    if (match.index !== position) return false;
    position = GO_DURATION_PART.lastIndex;
    const unit = match[0].match(/(?:ns|us|µs|μs|ms|s|m|h)$/)?.[0];
    if (!unit) return false;
    const number = match[0].slice(0, -unit.length);
    const [integer = '0', fraction = ''] = number.split('.');
    const scale = 10n ** BigInt(fraction.length);
    const numerator = BigInt(integer || '0') * scale + BigInt(fraction || '0');
    total += (numerator * GO_DURATION_UNITS[unit]) / scale;
    const limit = sign === '-' ? MAX_DURATION + 1n : MAX_DURATION;
    if (total > limit) return false;
  }
  return position === unsigned.length && position > 0;
}

function parseStandardCycle(expression: string): void {
  const fields = expression.split(/\s+/);
  if (fields.length !== 5) throw new Error('Cron cycle must have five fields');
  // robfig/cron does not support cron-parser's L/#/H extensions.
  if (
    /#|(?:^|[-\s,/])(?:L|H)(?=$|[-\s,/])/i.test(expression) ||
    fields.some((field) => !/^[\w*?,/-]+$/.test(field))
  ) {
    throw new Error('Cron cycle contains unsupported syntax');
  }
  for (const segment of fields[4].split(',')) {
    const range = segment.split('/', 1)[0];
    if ((range.match(/\d+/g) ?? []).some((value) => Number(value) > 6)) {
      throw new Error('Day of week must be between 0 and 6');
    }
  }
  const current = now();
  const horizon = current.add(5, 'year').endOf('year').toDate();
  CronExpressionParser.parse(expression, {
    currentDate: current.toDate(),
    endDate: horizon,
  }).next();
}

export function validateCronCycle(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  const expression = value.trim();
  if (STANDARD_DESCRIPTORS.has(expression)) return true;
  if (expression.startsWith('@every ')) return parseGoDuration(expression.slice(7));
  if (expression.startsWith('@')) return false;
  try {
    parseStandardCycle(expression);
    return true;
  } catch {
    return false;
  }
}

export function describeCronCycle(value: string, language: CronCycleLanguage): string {
  const expression = value.trim();
  if (!validateCronCycle(expression)) throw new Error('Invalid cron cycle');
  if (expression.startsWith('@every ')) {
    return language === 'zh-CN' ? `每隔 ${expression.slice(7)}` : `Every ${expression.slice(7)}`;
  }
  return cronstrue.toString(expression, {
    throwExceptionOnParseError: true,
    locale: language === 'zh-CN' ? 'zh_CN' : 'en',
    use24HourTimeFormat: true,
    verbose: true,
  });
}

export function formatCronCycle(value: string, language: CronCycleLanguage): string {
  try {
    return describeCronCycle(value, language);
  } catch {
    return value;
  }
}
