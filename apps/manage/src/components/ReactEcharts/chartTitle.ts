import i18n, { tFragment } from '@/i18n';

/** 图表标题的三个槽位：按什么维度分（dimension）、看什么指标（metric）、用什么形态看（form）。 */
export type ChartForm = keyof typeof FORM_LABELS;

type Label = () => string;

const FORM_LABELS = {
  ranking: () => tFragment('common.chart.forms.ranking'),
  share: () => tFragment('common.chart.forms.share'),
  trend: () => tFragment('common.chart.forms.trend'),
  composition: () => tFragment('common.chart.forms.composition'),
  distribution: () => tFragment('common.chart.forms.distribution'),
  comparison: () => tFragment('common.chart.forms.comparison'),
} satisfies Record<string, Label>;

/**
 * 维度与指标词表属于项目自己的业务词汇：项目在自己的 `common.chart.*` 词表声明真实维度/指标词条，
 * 调用方以 `tFragment("common.chart.dimensions.<维度>")` / `tFragment("common.chart.metrics.<指标>")`
 * 传入已翻译片段。形态（form）是共享封闭集合，语序与拼接由本模块统一，业务不得绕过另写标题文案。
 */
export interface ChartTitleParts {
  /** 已翻译的维度词片段；不传表示随时间看（趋势类），标题不带维度词。 */
  dimension?: string;
  /** 已翻译的指标词片段，可多个——用本地化连接词拼接，如“调用量与错误数”。 */
  metric: string | string[];
  form: ChartForm;
}

/** “按{维度}”：视图切换项的统一文案；dimension 为已翻译片段。 */
export function chartDimensionLabel(dimension: string): string {
  return i18n.t('common.chart.byDimension', { dimension });
}

/**
 * 图表标题的唯一拼接入口：`common.chart.titleTemplate` 按语言决定语序
 * （中文“按分组统计调用量排行”，英文“Calls ranking by group”），页面不再各自手写标题文案。
 * 调用方处于 useTranslation 的组件内，语言切换时随之重渲染。
 */
export function chartTitle({ dimension, metric: metricParts, form }: ChartTitleParts): string {
  const metric = (Array.isArray(metricParts) ? metricParts : [metricParts]).join(
    tFragment('common.chart.metricJoiner')
  );
  const formLabel = FORM_LABELS[form]();
  return dimension
    ? i18n.t('common.chart.titleTemplate', { metric, form: formLabel, dimension })
    : i18n.t('common.chart.titleTemplateNoDimension', { metric, form: formLabel });
}
