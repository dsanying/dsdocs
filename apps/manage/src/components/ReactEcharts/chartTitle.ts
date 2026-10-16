import i18n, { tFragment } from '@/i18n';

/** 图表标题的三个槽位：按什么维度分（dimension）、看什么指标（metric）、用什么形态看（form）。 */
export type ChartDimension = keyof typeof DIMENSION_LABELS;
export type ChartMetric = keyof typeof METRIC_LABELS;
export type ChartForm = keyof typeof FORM_LABELS;

type Label = () => string;

const DIMENSION_LABELS = {
  department: () => tFragment('common.chart.dimensions.department'),
  quotaPool: () => tFragment('common.objects.quotaPool'),
  person: () => tFragment('common.chart.dimensions.person'),
  model: () => tFragment('common.chart.dimensions.model'),
  service: () => tFragment('common.chart.dimensions.service'),
  identity: () => tFragment('common.chart.dimensions.identity'),
  hour: () => tFragment('common.chart.dimensions.hour'),
} satisfies Record<string, Label>;

const METRIC_LABELS = {
  cost: () => tFragment('common.chart.metrics.cost'),
  requests: () => tFragment('common.chart.metrics.requests'),
  tokens: () => tFragment('common.chart.metrics.tokens'),
  costPerRequest: () => tFragment('common.chart.metrics.costPerRequest'),
  tokensPerRequest: () => tFragment('common.chart.metrics.tokensPerRequest'),
  activeUsers: () => tFragment('common.chart.metrics.activeUsers'),
} satisfies Record<string, Label>;

const FORM_LABELS = {
  ranking: () => tFragment('common.chart.forms.ranking'),
  share: () => tFragment('common.chart.forms.share'),
  trend: () => tFragment('common.chart.forms.trend'),
  composition: () => tFragment('common.chart.forms.composition'),
  distribution: () => tFragment('common.chart.forms.distribution'),
  comparison: () => tFragment('common.chart.forms.comparison'),
} satisfies Record<string, Label>;

export interface ChartTitleParts {
  /** 不传表示随时间看（趋势类），标题不带维度词。 */
  dimension?: ChartDimension;
  /** 单个指标，或多个指标（用本地化连接词拼接，如“费用与请求数”）。 */
  metric: ChartMetric | ChartMetric[];
  form: ChartForm;
}

/** “按{维度}”：视图切换项的统一文案。 */
export function chartDimensionLabel(dimension: ChartDimension): string {
  return i18n.t('common.chart.byDimension', { dimension: DIMENSION_LABELS[dimension]() });
}

/**
 * 图表标题的唯一拼接入口：`common.chart.titleTemplate` 按语言决定语序
 * （中文“学院费用排行”，英文“Cost ranking by department”），词表来自 common.chart.*，
 * 页面不再各自手写标题文案。调用方处于 useTranslation 的组件内，语言切换时随之重渲染。
 */
export function chartTitle({ dimension, metric: metricParts, form }: ChartTitleParts): string {
  const metrics = (Array.isArray(metricParts) ? metricParts : [metricParts]).map((item) =>
    METRIC_LABELS[item]()
  );
  const metric = metrics.join(tFragment('common.chart.metricJoiner'));
  const formLabel = FORM_LABELS[form]();
  const title = dimension
    ? i18n.t('common.chart.titleTemplate', {
        metric,
        form: formLabel,
        dimension: DIMENSION_LABELS[dimension](),
      })
    : i18n.t('common.chart.titleTemplateNoDimension', { metric, form: formLabel });
  // 中英混排间距由 i18n 排版后处理器统一补齐
  return title;
}
