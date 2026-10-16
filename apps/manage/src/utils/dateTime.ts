import dayjs, { type Dayjs } from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime.js';
import timezone from 'dayjs/plugin/timezone.js';
import utc from 'dayjs/plugin/utc.js';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(relativeTime);

/**
 * 项目业务时区：后端进程（gtime.SetTimeZone）、数据库会话（gdb timezone）与接口里不带偏移的时间字符串
 * （"2026-09-16 15:47:55"）全部按它解释；前端所有“现在”、日期边界、展示与提交都固定用它，
 * 不随设备时区漂移——不同时区的用户看到的是同一份时间。
 */
export const BUSINESS_TIME_ZONE = 'Asia/Shanghai';
dayjs.tz.setDefault(BUSINESS_TIME_ZONE);

/** 带偏移的 ISO 串（2026-09-16T15:47:55+08:00）或 Unix 毫秒/Date：本身已无歧义。 */
const HAS_OFFSET = /(?:Z|[+-]\d{2}:?\d{2})$/;

/** 业务时区里的“现在”。 */
export const now = (): Dayjs => dayjs().tz(BUSINESS_TIME_ZONE);

/**
 * 解析接口/存储里的时间：不带偏移的字符串按业务时区解释（后端就是这么序列化的），
 * 带偏移的串、Date、毫秒数与 Dayjs 只做时区换算。任何来源的时间进前端只走这一处。
 */
export function parseServerTime(value: string | number | Date | Dayjs): Dayjs {
  if (typeof value === 'string' && !HAS_OFFSET.test(value.trim()))
    return dayjs.tz(value, BUSINESS_TIME_ZONE);
  return dayjs(value).tz(BUSINESS_TIME_ZONE);
}

/** 提交给后端的时间：业务时区 + 显式偏移（YYYY-MM-DDTHH:mm:ss+08:00），后端不必猜。 */
export const toOffsetDateTime = (value: Dayjs) =>
  value.tz(BUSINESS_TIME_ZONE).format('YYYY-MM-DDTHH:mm:ssZ');

/**
 * 面向用户展示的日期格式：全站日期分隔符统一为 "/"（2026/09/16、09/16），不用 "-"。
 * 展示、DatePicker 的 format 与图表类目都只从这里取；提交给后端的格式见 toOffsetDateTime。
 */
export const DATE_FORMAT = 'YYYY/MM/DD';
export const DATE_TIME_FORMAT = `${DATE_FORMAT} HH:mm:ss`;
export const DATE_TIME_MINUTE_FORMAT = `${DATE_FORMAT} HH:mm`;
export const MONTH_FORMAT = 'YYYY/MM';
export const YEAR_FORMAT = 'YYYY';
export const MONTH_DAY_FORMAT = 'MM/DD';
export const MONTH_DAY_TIME_FORMAT = `${MONTH_DAY_FORMAT} HH:mm`;

/** 面向用户展示的时间格式（业务时区）；dayjs locale 已随 i18n 语言切换。 */
export const formatDateTime = (value: string | number | Date | Dayjs) =>
  parseServerTime(value).format(DATE_TIME_FORMAT);

/** 展示到分钟的时间格式。 */
export const formatDateTimeMinute = (value: string | number | Date | Dayjs) =>
  parseServerTime(value).format(DATE_TIME_MINUTE_FORMAT);

/** 纯日期格式。 */
export const formatDate = (value: string | number | Date | Dayjs) =>
  parseServerTime(value).format(DATE_FORMAT);

/** 月/日（图表周期标签等紧凑场景）。 */
export const formatMonthDay = (value: string | number | Date | Dayjs) =>
  parseServerTime(value).format(MONTH_DAY_FORMAT);

/** 月/日 时:分（近期事件列表等紧凑场景）。 */
export const formatMonthDayTime = (value: string | number | Date | Dayjs) =>
  parseServerTime(value).format(MONTH_DAY_TIME_FORMAT);

/** 相对“现在”的时间（“3 小时前” / “3 hours ago”）；文案随 dayjs 当前 locale。 */
export const formatRelativeTime = (value: string | number | Date | Dayjs) =>
  parseServerTime(value).locale(dayjs.locale()).from(now());

/** 接口里的日期桶（YYYY-MM-DD / YYYY-MM，可带时刻）。 */
const DATE_BUCKET = /^(\d{4})-(\d{2})(?:-(\d{2}))?(?=$|[ T])/;

/**
 * 图表类目、聚合桶等“接口原样给出的日期标签”换成展示分隔符：只替换开头的日期部分，
 * 不做时区换算（桶已按业务时区切好）；"HH:00" 等非日期标签原样返回。
 */
export const formatDateLabel = (value: string) =>
  value.replace(DATE_BUCKET, (_, year: string, month: string, day?: string) =>
    day ? `${year}/${month}/${day}` : `${year}/${month}`
  );

/** 文件名里的紧凑日期（YYMMDD）；无法解析时返回 unknown。 */
export const formatCompactDate = (value: string) => {
  const parsed = parseServerTime(value);
  return parsed.isValid() ? parsed.format('YYMMDD') : 'unknown';
};

/** 最近 N 天（含今天）的起止：按业务时区的日界。 */
export const rangeOfRecentDays = (days: number) => ({
  startTime: toOffsetDateTime(
    now()
      .subtract(days - 1, 'day')
      .startOf('day')
  ),
  endTime: toOffsetDateTime(now().endOf('day')),
});

export const getDefaultRange = () => rangeOfRecentDays(30);
