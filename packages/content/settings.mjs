/** @typedef {{siteName:string,description:string,logoAssetId:string|null,faviconAssetId:string|null,baseFontSize:number,fontFamily:'system'|'serif',lineHeight:number,accentColor:string,theme:'system'|'light'|'dark',contentWidth:'normal'|'wide',showToc:boolean,showBreadcrumb:boolean,showPreviousNext:boolean,searchEnabled:boolean,defaultLanguage:'auto'|'zh'|'en',homeTranslationId:string|null,footerText:string,footerLinks:{label:string,url:string}[]}} SiteSettings */
/** @type {SiteSettings} */
export const defaultSettings = Object.freeze({
  siteName: 'DSdocs',
  description: '',
  logoAssetId: null,
  faviconAssetId: null,
  baseFontSize: 16,
  fontFamily: 'system',
  lineHeight: 1.75,
  accentColor: '#171717',
  theme: 'system',
  contentWidth: 'normal',
  showToc: true,
  showBreadcrumb: true,
  showPreviousNext: true,
  searchEnabled: true,
  defaultLanguage: 'auto',
  homeTranslationId: null,
  footerText: '',
  footerLinks: [],
});
const invalid = (message) => {
  throw Object.assign(new Error(message), { status: 400 });
};
export function validateSettings(input) {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => !Object.hasOwn(defaultSettings, key))
  )
    invalid('站点设置包含不支持的字段。');
  const result = { ...structuredClone(defaultSettings), ...input };
  for (const [key, max] of [
    ['siteName', 80],
    ['description', 300],
    ['footerText', 500],
  ]) {
    if (
      typeof result[key] !== 'string' ||
      result[key].length > max ||
      /[\x00-\x08\x0b-\x1f\x7f]/.test(result[key])
    )
      invalid('站点文字格式或长度无效。');
    result[key] = result[key].trim();
  }
  if (!result.siteName || /[\r\n]/.test(result.siteName)) invalid('请填写单行站点名称。');
  for (const key of ['logoAssetId', 'faviconAssetId', 'homeTranslationId'])
    if (
      result[key] !== null &&
      (typeof result[key] !== 'string' || !/^[a-f0-9-]{36}$/.test(result[key]))
    )
      invalid('站点资源标识无效。');
  if (
    !Number.isInteger(result.baseFontSize) ||
    result.baseFontSize < 14 ||
    result.baseFontSize > 20
  )
    invalid('阅读字号须为 14–20 px。');
  if (
    typeof result.lineHeight !== 'number' ||
    !Number.isFinite(result.lineHeight) ||
    result.lineHeight < 1.4 ||
    result.lineHeight > 2.2
  )
    invalid('正文行高须为 1.4–2.2。');
  for (const [key, values] of Object.entries({
    fontFamily: ['system', 'serif'],
    theme: ['system', 'light', 'dark'],
    contentWidth: ['normal', 'wide'],
    defaultLanguage: ['auto', 'zh', 'en'],
  }))
    if (!values.includes(result[key])) invalid('站点选项无效。');
  for (const key of ['showToc', 'showBreadcrumb', 'showPreviousNext', 'searchEnabled'])
    if (typeof result[key] !== 'boolean') invalid('站点开关须为布尔值。');
  if (typeof result.accentColor !== 'string' || !/^#[a-f0-9]{6}$/i.test(result.accentColor))
    invalid('品牌色须为六位十六进制颜色。');
  result.accentColor = result.accentColor.toLowerCase();
  if (!Array.isArray(result.footerLinks) || result.footerLinks.length > 5)
    invalid('页脚链接最多五项。');
  result.footerLinks = result.footerLinks.map((link) => {
    if (
      !link ||
      typeof link !== 'object' ||
      Object.keys(link).some((key) => !['label', 'url'].includes(key)) ||
      typeof link.label !== 'string' ||
      !link.label.trim() ||
      link.label.length > 40 ||
      typeof link.url !== 'string' ||
      link.url.length > 500 ||
      /[\x00-\x20\x7f]/.test(link.url) ||
      !/^(https?:\/\/|mailto:|\/docs\/|#)/i.test(link.url)
    )
      invalid('页脚链接的名称或地址无效。');
    if (/^https?:/i.test(link.url)) {
      try {
        const url = new URL(link.url);
        if (url.username || url.password) invalid('链接不能包含账号凭据。');
      } catch {
        invalid('页脚链接地址无效。');
      }
    }
    return { label: link.label.trim(), url: link.url };
  });
  return result;
}
export const settingsAssetIds = (settings) =>
  [settings.logoAssetId, settings.faviconAssetId].filter(Boolean);
// Generate readable variants for both native Fumadocs themes from one brand color.
function contrastColor(hex, dark) {
  let rgb = hex
    .slice(1)
    .match(/../g)
    .map((value) => parseInt(value, 16));
  const luminance = (values) =>
    values
      .map((n) => n / 255)
      .map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4))
      .reduce((sum, n, i) => sum + n * [0.2126, 0.7152, 0.0722][i], 0);
  for (let i = 0; i < 256; i++) {
    const l = luminance(rgb);
    if (dark ? (l + 0.05) / 0.05 >= 4.5 : 1.05 / (l + 0.05) >= 4.5) break;
    rgb = rgb.map((n) => (dark ? Math.min(255, n + 1) : Math.max(0, n - 1)));
  }
  return '#' + rgb.map((n) => n.toString(16).padStart(2, '0')).join('');
}
export function readerStyle(settings) {
  const value = validateSettings(settings);
  const font =
    value.fontFamily === 'serif'
      ? 'Georgia,"Noto Serif CJK SC","Songti SC",serif'
      : 'system-ui,-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif';
  return `:root{font-size:${value.baseFontSize}px;--dsdocs-line-height:${value.lineHeight};--color-fd-primary:${contrastColor(value.accentColor, false)};--color-fd-primary-foreground:#fff}html.dark{--color-fd-primary:${contrastColor(value.accentColor, true)};--color-fd-primary-foreground:#111}body{font-family:${font}}.document-prose{line-height:var(--dsdocs-line-height,1.75)}`;
}
