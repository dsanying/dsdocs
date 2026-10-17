import { SelectCandidatesFixture } from './select-candidates-fixture';
import { NotificationMotionFixture } from './notification-motion-fixture';
import { QueryLayoutFixture } from './query-layout-fixture';
import { FormSubmitFixture } from './form-submit-fixture';
import { ActionFooterFixture } from './action-footer-fixture';
import { TableFitFixture } from './table-fit-fixture';
import { TableAlignmentFixture } from './table-alignment-fixture';
import { ChartLegendFixture } from './chart-legend-fixture';
import { NativeCompareFixture } from './native-compare-fixture';
import { PageFooterSlotProvider } from '../../src/components/ui/PageFooterSlot';
import { DrawerForm } from '../../src/components/ui/DrawerForm';
import { DEFAULT_PAGE_SIZE, buildTablePagination } from '../../src/components/ui/tableConfig';
import {
  BookOutlined,
  UserOutlined,
  SaveOutlined,
  CloseOutlined,
  SwapOutlined,
  PlusOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  MinusCircleOutlined,
} from '@ant-design/icons';
import {
  App as AntdApp,
  Layout,
  Button,
  ConfigProvider,
  Modal,
  Form,
  Input,
  InputNumber,
  DatePicker,
} from 'antd';
import { createRoot } from 'react-dom/client';
import { StrictMode, useEffect, useRef, useState } from 'react';
import { MemoryRouter } from 'react-router';
import zhCN from 'antd/locale/zh_CN';
import enUS from 'antd/locale/en_US';
import i18n from '../../src/i18n';
import { useTranslation } from 'react-i18next';
import { DATE_FORMAT, DATE_TIME_MINUTE_FORMAT, parseServerTime } from '../../src/utils/dateTime';
import {
  SidebarMenu,
  AccountMenu,
  AppPage,
  SectionHeader,
  ResponsiveActions,
  DetailDrawer,
  LoadingOverlay,
  DataTable,
  AtomicValue,
  ActionLink,
  QueryForm,
  Stack,
  Table,
  TablePanel,
  columnWidth,
  PageStack,
  InformationFieldGrid,
  FormGrid,
  FilterSelect,
  MultiSelect,
  StatusTag,
  MetadataTag,
  SaveBar,
  IconButton,
  Popconfirm,
  QueryFeedback,
  ResponsiveTabs,
  SearchInput,
  SummaryStrip,
  ViewSwitch,
  notificationDefaults,
  modalDefaults,
  installOverflowScroll,
  IconLabelHint,
} from '../../src/components/ui';
import { buildThemeConfig } from '../../src/config/theme';
import { getInstanceByDom } from 'echarts/core';
import { BarList } from '../../src/components/ReactEcharts/BarList';
import { useThemeStore } from '../../src/stores/useThemeStore';
import { useRequest } from '../../src/hooks/useRequest';
import { useDataTable } from '../../src/hooks/useDataTable';
import '../../src/design/tokens.css';
import '../../src/global.css';
import './contract-fixture.css';

const language = new URLSearchParams(window.location.search).get('lang');
if (language === 'zh-CN' || language === 'en-US') void i18n.changeLanguage(language);

const uiBundleConsoleSentinel = '[frontend-ui] console-bundle-sentinel';
console.info(uiBundleConsoleSentinel);

const longIdentifier = 'item-production-' + '0123456789abcdef'.repeat(4);
const tabItems = ['账户与身份', '资源权限与继承关系', '配置规则与历史记录', '审计与异常处理'].map(
  (label, index) => ({ key: String(index), label, children: <p>当前页签内容</p> })
);

function RequestRaceFixture() {
  const [entityKey, setEntityKey] = useState('slow');
  const [completionAck, setCompletionAck] = useState('无');
  const sequenceRef = useRef(0);
  const pendingRef = useRef<
    Array<{
      key: string;
      sequence: number;
      settled: boolean;
      resolve: (value: string) => void;
    }>
  >([]);
  const { data, loading, run } = useRequest(
    async () => {
      const requestedKey = entityKey;
      const sequence = ++sequenceRef.current;
      return new Promise<string>((resolve) => {
        pendingRef.current.push({ key: requestedKey, sequence, settled: false, resolve });
      });
    },
    {
      refreshDeps: [entityKey],
      resetDataOnRefreshDepsChange: true,
    }
  );
  const completeLatest = (key: string) => {
    const pending = pendingRef.current.findLast((item) => item.key === key && !item.settled);
    if (!pending) return;
    pending.settled = true;
    const value = `${pending.key}-${pending.sequence}`;
    pending.resolve(value);
    queueMicrotask(() => setCompletionAck(value));
  };

  return (
    <section aria-label="请求并发契约">
      <button type="button" onClick={() => setEntityKey('fast')}>
        切换实体
      </button>
      <button type="button" onClick={() => void run()}>
        刷新当前实体
      </button>
      <button type="button" onClick={() => completeLatest(entityKey)}>
        完成当前实体请求
      </button>
      <button type="button" onClick={() => completeLatest('slow')}>
        完成旧实体请求
      </button>
      <output aria-label="请求数据">{data ?? '无数据'}</output>
      <output aria-label="请求状态">{loading ? '加载中' : '已完成'}</output>
      <output aria-label="请求完成确认">{completionAck}</output>
    </section>
  );
}

type FixtureRow = { id: string; name: string };
type PendingTableRequest = {
  key: string;
  reject: (error: Error) => void;
  resolve: (result: { data: FixtureRow[]; total: number }) => void;
  settled: boolean;
};

function DataTableFixture() {
  const pendingRef = useRef<PendingTableRequest[]>([]);
  const table = useDataTable<FixtureRow, { keyword?: string }>({
    initialFilters: {},
    request: ({ current, filters, sort }) =>
      new Promise((resolve, reject) => {
        const key = `${filters.keyword ?? 'all'}:${current}:${sort.field ?? 'none'}`;
        pendingRef.current.push({ key, reject, resolve, settled: false });
      }),
  });
  const settle = (pending: PendingTableRequest | undefined, failed = false, total = 30) => {
    if (!pending) return;
    pending.settled = true;
    if (failed) {
      pending.reject(new Error(`${pending.key}-failed`));
    } else {
      pending.resolve({ data: [{ id: `${pending.key}-1`, name: pending.key }], total });
    }
  };
  const latest = () => pendingRef.current.findLast((item) => !item.settled);
  const oldest = () => pendingRef.current.find((item) => !item.settled);

  return (
    <section aria-label="表格请求契约">
      <button type="button" onClick={() => table.submitFilters({ keyword: 'fast' })}>
        提交筛选
      </button>
      <button type="button" onClick={() => table.setPage(2, 10)}>
        翻到第二页
      </button>
      <button type="button" onClick={() => table.setPage(3, 10)}>
        翻到第三页
      </button>
      <button type="button" onClick={() => void table.reload()}>
        刷新表格
      </button>
      <button type="button" onClick={() => settle(latest())}>
        完成最新请求
      </button>
      <button type="button" onClick={() => settle(oldest())}>
        完成最早请求
      </button>
      <button type="button" onClick={() => settle(latest(), true)}>
        失败最新请求
      </button>
      <button type="button" onClick={() => settle(latest(), false, 10)}>
        完成最新请求总数10
      </button>
      <button type="button" onClick={() => settle(oldest(), false, 10)}>
        完成最早请求总数10
      </button>
      <output aria-label="表格页码">{table.query.current}</output>
      <output aria-label="表格状态">{table.loading ? '加载中' : '已完成'}</output>
      <output aria-label="表格行">{table.rows.map((row) => row.name).join(',') || '无'}</output>
      <DataTable<FixtureRow>
        controller={table}
        columns={[{ title: '名称', dataIndex: 'name', sorter: true }]}
        rowKey="id"
        emptyDescription="没有符合条件的记录"
      />
    </section>
  );
}

/** 确认类按钮契约：Modal 页脚、Modal.confirm、Popconfirm 的确定/取消与页面动作一同带图标。 */
function ConfirmButtonsFixture() {
  const { modal } = AntdApp.useApp();
  const [open, setOpen] = useState(false);
  return (
    <section aria-label="确认按钮契约">
      <Button icon={<EditOutlined />} onClick={() => setOpen(true)}>
        打开弹窗
      </Button>
      <Button
        icon={<DeleteOutlined />}
        onClick={() => modal.confirm({ title: '确认执行？', content: '删除后不可恢复' })}
      >
        打开确认
      </Button>
      <Popconfirm title="确认执行？" description="移除后需重新绑定">
        <Button color="danger" variant="outlined" icon={<DeleteOutlined />}>
          移除
        </Button>
      </Popconfirm>
      <Modal title="编辑" open={open} onCancel={() => setOpen(false)} onOk={() => setOpen(false)}>
        <p>弹窗内容</p>
      </Modal>
    </section>
  );
}

function IconHintStepsFixture() {
  const [step, setStep] = useState(0);
  const [submitted, setSubmitted] = useState(0);
  return (
    <main>
      <h1>图标提示分步操作</h1>
      <IconButton
        label="提交下一项"
        icon={<EditOutlined />}
        onClick={() => setSubmitted((value) => value + 1)}
      />
      {step < 2 && (
        <IconButton
          label={step === 0 ? '预览上传内容' : '确认上传'}
          icon={<EditOutlined />}
          onClick={() => setStep((value) => value + 1)}
        />
      )}
      <output aria-label="下一项提交次数">{submitted}</output>
    </main>
  );
}

/** 夹具主题来自 ?theme=，挂载前写到 html[data-theme]，让 token 与 Ant 主题一致。 */
function fixtureTheme(): 'light' | 'dark' {
  return new URLSearchParams(window.location.search).get('theme') === 'dark' ? 'dark' : 'light';
}

export function Fixture() {
  const [copied, setCopied] = useState(0);
  const showAppPageTitle = new URLSearchParams(window.location.search).has('appPageTitle');
  const showQueryFeedback = new URLSearchParams(window.location.search).has('queryFeedback');
  const retry = () => undefined;
  // ?theme=dark 渲染暗色：token 由 html[data-theme] 切换（挂载前已写好，见 mount），Ant 主题同步
  const themeMode = fixtureTheme();
  return (
    <ConfigProvider
      theme={
        new URLSearchParams(window.location.search).has('quickClose')
          ? {
              ...buildThemeConfig(themeMode),
              token: { ...buildThemeConfig(themeMode).token, motionDurationSlow: '2s' },
            }
          : buildThemeConfig(themeMode)
      }
      locale={i18n.language === 'en-US' ? enUS : zhCN}
      modal={modalDefaults}
    >
      <AntdApp notification={notificationDefaults}>
        <IconLabelHint />
        {new URLSearchParams(window.location.search).has('longFields') ? (
          <section aria-label="长字段详情">
            <InformationFieldGrid
              items={[
                {
                  key: 'long',
                  label: 'Lifecycle limit and accumulated consumption',
                  value: 'item-'.repeat(40),
                },
                { key: 'short', label: 'Owner', value: 'short-owner' },
              ]}
            />
          </section>
        ) : null}
        {new URLSearchParams(window.location.search).has('longTags') ? (
          <section aria-label="长标签">
            <div style={{ width: '240px' }}>
              <MetadataTag icon={<CopyOutlined />} closable>
                {'inherited-from-'.repeat(30)}
              </MetadataTag>
              <MetadataTag>short-tag</MetadataTag>
            </div>
          </section>
        ) : null}
        {new URLSearchParams(window.location.search).has('orderingDetails') ? (
          <OrderingDetailsFixture />
        ) : new URLSearchParams(window.location.search).has('queryLayout') ? (
          <QueryLayoutFixture />
        ) : new URLSearchParams(window.location.search).has('selectCandidates') ? (
          <SelectCandidatesFixture />
        ) : new URLSearchParams(window.location.search).has('notificationMotion') ? (
          <NotificationMotionFixture />
        ) : new URLSearchParams(window.location.search).has('iconHintSteps') ? (
          <IconHintStepsFixture />
        ) : new URLSearchParams(window.location.search).has('formSubmit') ? (
          <StrictMode>
            <FormSubmitFixture />
          </StrictMode>
        ) : new URLSearchParams(window.location.search).has('actionFooter') ? (
          <ActionFooterFixture />
        ) : new URLSearchParams(window.location.search).has('filterSelection') ? (
          <FilterSelectionFixture />
        ) : new URLSearchParams(window.location.search).has('pagination') ? (
          <PaginationFixture />
        ) : new URLSearchParams(window.location.search).has('navigation') ? (
          <SidebarFixture />
        ) : new URLSearchParams(window.location.search).has('tableRendering') ? (
          <TableRenderFixture />
        ) : new URLSearchParams(window.location.search).has('datePopups') ? (
          <DatePopupFixture />
        ) : new URLSearchParams(window.location.search).has('boundedContent') ? (
          <BoundedContentFixture />
        ) : new URLSearchParams(window.location.search).has('drawerLifecycle') ? (
          <DrawerLifecycleFixture />
        ) : new URLSearchParams(window.location.search).has('chartLabels') ? (
          <ChartLabelFixture />
        ) : new URLSearchParams(window.location.search).has('barList') ? (
          <BarListSelectionFixture />
        ) : new URLSearchParams(window.location.search).has('editForm') ? (
          <EditFormFixture />
        ) : new URLSearchParams(window.location.search).has('catalog') ? (
          <ComponentCatalogFixture />
        ) : new URLSearchParams(window.location.search).has('tableFit') ? (
          <TableFitFixture />
        ) : new URLSearchParams(window.location.search).has('tableAlignment') ? (
          <TableAlignmentFixture />
        ) : new URLSearchParams(window.location.search).has('chartLegend') ? (
          <ChartLegendFixture />
        ) : new URLSearchParams(window.location.search).has('nativeCompare') ? (
          <NativeCompareFixture />
        ) : showQueryFeedback ? (
          <main>
            <h1>查询错误反馈契约</h1>
            <section aria-label="本地文本错误">
              <QueryFeedback
                error={new Error('本地字符串错误')}
                errorTitle="字符串请求失败"
                retryLabel="重试"
                onRetry={retry}
              />
            </section>
            <section aria-label="本地 Error">
              <QueryFeedback
                error={new Error('本地校验失败')}
                errorTitle="本地请求失败"
                retryLabel="重试"
                onRetry={retry}
              />
            </section>
            <section aria-label="客户端错误">
              <QueryFeedback
                error={{ response: { status: 422, data: { message: '字段格式错误' } } }}
                errorTitle="提交失败"
                retryLabel="重试"
                onRetry={retry}
              />
            </section>
            <section aria-label="客户端裸文本错误">
              <QueryFeedback
                error={{ response: { status: 400, data: 'database constraint details' } }}
                errorTitle="请求参数错误"
                retryLabel="重试"
                onRetry={retry}
              />
            </section>
            <section aria-label="客户端 HTML 错误">
              <QueryFeedback
                error={{
                  response: { status: 404, data: '<html><body>gateway internals</body></html>' },
                }}
                errorTitle="未找到资源"
                retryLabel="重试"
                onRetry={retry}
              />
            </section>
            <section aria-label="服务端错误">
              <QueryFeedback
                error={{
                  response: { status: 503, data: { message: 'database password=super-secret' } },
                }}
                errorTitle="加载失败"
                retryLabel="重试"
                onRetry={retry}
              />
            </section>
          </main>
        ) : showAppPageTitle ? (
          <AppPage title={<span>ReactNode 页面标题</span>}>
            <p>页面内容</p>
          </AppPage>
        ) : (
          <main className="contract-page">
            <h1>共享组件契约</h1>
            <section aria-label="均衡详情">
              <InformationFieldGrid
                items={[
                  { key: 'note', label: '说明', value: '整行正文', span: 'full' },
                  ...Array.from({ length: 5 }, (_, index) => ({
                    key: index,
                    label: `短字段 ${index + 1}`,
                    value: index === 0 ? 'user-a@example.com' : 'SHCC',
                  })),
                ]}
              />
            </section>
            <section aria-label="详情信息">
              <InformationFieldGrid
                compact
                items={[
                  { key: 'status', label: '处理状态', value: '待处理' },
                  { key: 'date', label: 'Publication time', value: '2026/10/12 12:34' },
                  {
                    key: 'title',
                    label: 'Notification title (English)',
                    value: 'A complete English notification title with no crowded label',
                    span: 'full',
                  },
                ]}
              />
            </section>
            <section aria-label="标识符">
              <div className="identifier-wide">
                <AtomicValue text="short-id" />
              </div>
              <div className="identifier-narrow">
                <AtomicValue text={longIdentifier} />
              </div>
            </section>
            <section className="tabs-boundary" aria-label="页签">
              <ResponsiveTabs items={tabItems} />
            </section>
            <section className="tabs-boundary" aria-label="无内容页签">
              <ResponsiveTabs
                variant="navigation-only"
                items={tabItems.map(({ key, label }) => ({ key, label }))}
              />
            </section>
            {/* 均衡分列：短值放得下就一行多列；同样项数的长值放不下时整体降为单列，不排 2+1 */}
            <section className="strip-boundary" aria-label="短值指标条">
              <SummaryStrip
                label="继承关系"
                items={[
                  { key: 'parents', label: '直接父标签', value: 1 },
                  { key: 'children', label: '直接子标签', value: 0 },
                  { key: 'status', label: '继承状态', value: '关系正常' },
                ]}
              />
            </section>
            <section className="strip-boundary" aria-label="长值指标条">
              <SummaryStrip
                label="余额"
                items={[
                  { key: 'a', label: '资源总量', value: '¥ 1,234,567.890' },
                  { key: 'b', label: '本周期已用', value: '¥ 1,234,567.890' },
                  { key: 'c', label: '进度指标', value: '¥ 1,234,567.890' },
                ]}
              />
            </section>
            <section aria-label="必要搜索规则">
              <SearchInput aria-label="检索词" hint="按空格拆分多个关键词，全部命中才显示" />
            </section>
            <section className="switch-boundary" aria-label="视图切换">
              <ViewSwitch
                size="small"
                options={['总览', '按分组查看完整统计', '按类别查看完整统计']}
              />
            </section>
            {/* 语义色图标分段项：选中项是反色表面，图标必须换成 *-on-inverse 一套才可读 */}
            <section className="switch-boundary" aria-label="生效切换">
              <ViewSwitch
                size="small"
                defaultValue="allow"
                options={[
                  {
                    value: 'none',
                    label: (
                      <span aria-label="未配置">
                        <MinusCircleOutlined />
                      </span>
                    ),
                  },
                  {
                    value: 'allow',
                    label: (
                      <span aria-label="允许">
                        <CheckCircleOutlined style={{ color: 'var(--ds-color-success)' }} />
                      </span>
                    ),
                  },
                  {
                    value: 'deny',
                    label: (
                      <span aria-label="拒绝">
                        <CloseCircleOutlined style={{ color: 'var(--ds-color-error)' }} />
                      </span>
                    ),
                  },
                ]}
              />
            </section>
            <IconButton
              label="复制标识符"
              icon={<CopyOutlined />}
              onClick={() => setCopied((value) => value + 1)}
            />
            <output aria-live="polite">已复制 {copied} 次</output>
            <StrictMode>
              <FormSubmitFixture />
            </StrictMode>
            <RequestRaceFixture />
            <DataTableFixture />
            <ConfirmButtonsFixture />
          </main>
        )}
      </AntdApp>
    </ConfigProvider>
  );
}

document.documentElement.dataset.theme = fixtureTheme();
if (
  new URLSearchParams(window.location.search).has('barList') ||
  new URLSearchParams(window.location.search).has('chartLabels')
)
  useThemeStore.getState().setPreference(fixtureTheme());
installOverflowScroll(document.body);
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MemoryRouter>
      <Fixture />
    </MemoryRouter>
  </StrictMode>
);

/** 只在 ?barList 挂载；定位读取真实实例，选择只由 Playwright 的画布鼠标点击触发。 */
function BarListSelectionFixture() {
  const chartHost = useRef<HTMLDivElement>(null);
  const mode = useThemeStore((state) => state.mode);
  const [version, setVersion] = useState(0);
  const [selectable, setSelectable] = useState(
    !new URLSearchParams(window.location.search).has('readonly')
  );
  const [selections, setSelections] = useState<
    Array<{ category: string; index: number; version: number }>
  >([]);
  const [canvasClicks, setCanvasClicks] = useState(0);
  const [hit, setHit] = useState<{
    chartID: string;
    mode: string;
    version: number;
    points: Array<{ category: string; index: number; x: number; y: number }>;
  } | null>(null);
  const categories = version % 2 ? ['Delta', 'Epsilon', 'Zeta', 'Eta'] : ['Alpha', 'Beta', 'Gamma'];
  const values = version % 2 ? [27, 84, 42, 63] : [80, 50, 20];
  const locate = async () => {
    setHit(null);
    const dom = chartHost.current?.querySelector<HTMLElement>('[_echarts_instance_]');
    const chart = dom && getInstanceByDom(dom);
    if (!chart || !dom) throw new Error('BarList chart has not mounted');
    // 等实际动画结束，不能以 setOption 已返回代替条形已到最终命中位置。
    await new Promise<void>((resolve, reject) => {
      const deadline = performance.now() + 5000;
      const frame = () => {
        if (chart.isDisposed()) {
          reject(new Error('BarList chart disposed while locating'));
          return;
        }
        if (chart.getZr().animation.isFinished()) {
          requestAnimationFrame(() => resolve());
          return;
        }
        if (performance.now() > deadline) {
          reject(new Error('BarList animation did not settle'));
          return;
        }
        requestAnimationFrame(frame);
      };
      frame();
    });
    const box = dom.getBoundingClientRect();
    const points = categories.map((category, index) => {
      const point = chart.convertToPixel({ seriesIndex: 0 }, [values[index] / 2, category]);
      if (!point.every(Number.isFinite) || !chart.containPixel({ seriesIndex: 0 }, point))
        throw new Error('BarList point is outside the plot');
      return { category, index, x: box.left + point[0], y: box.top + point[1] };
    });
    setHit({ chartID: chart.id, mode, version, points });
  };
  return (
    <ConfigProvider theme={buildThemeConfig(mode)}>
      <main className="contract-page" data-fixture="bar-list">
        <h1>BarList 点击契约</h1>
        <button type="button" onClick={() => void locate()}>
          读取命中坐标
        </button>
        <button
          type="button"
          onClick={() => {
            setHit(null);
            useThemeStore.getState().toggle();
          }}
        >
          切换图表主题
        </button>
        <button
          type="button"
          onClick={() => {
            setHit(null);
            setVersion((value) => value + 1);
          }}
        >
          更新图表数据
        </button>
        <button
          type="button"
          onClick={() => {
            setHit(null);
            setSelectable((value) => !value);
          }}
        >
          切换选择回调
        </button>
        <div
          ref={chartHost}
          onClickCapture={(event) => {
            if (event.target instanceof HTMLCanvasElement) setCanvasClicks((value) => value + 1);
          }}
        >
          <BarList
            label="点击排行"
            categories={categories}
            series={[{ name: '数量', data: values }]}
            valueKind="integer"
            showValueLabel
            onSelect={
              selectable
                ? (category, index) =>
                    setSelections((current) => [...current, { category, index, version }])
                : undefined
            }
          />
        </div>
        <output aria-label="BarList 命中坐标">{JSON.stringify(hit)}</output>
        <output aria-label="BarList 业务选择">{JSON.stringify(selections)}</output>
        <output aria-label="BarList 画布点击次数">{canvasClicks}</output>
        <output aria-label="BarList 回调启用">{String(selectable)}</output>
      </main>
    </ConfigProvider>
  );
}

function ComponentCatalogFixture() {
  const [dirty, setDirty] = useState(!new URLSearchParams(window.location.search).has('clean'));
  const [selected, setSelected] = useState<number[]>([1, 2]);
  const auxiliary = new URLSearchParams(window.location.search).get('auxiliary');
  return (
    <main className="contract-page" data-fixture="component-catalog">
      <AppPage title="统一组件选型">
        <PageStack>
          <InformationFieldGrid
            items={[
              { key: 'name', label: '名称', value: <AtomicValue text={longIdentifier} /> },
              { key: 'status', label: '状态', value: <StatusTag tone="success">已完成</StatusTag> },
              { key: 'source', label: '来源', value: <MetadataTag>人工录入</MetadataTag> },
            ]}
          />
          <Form layout="vertical">
            <FormGrid>
              <Form.Item label="名称" tooltip="填写便于识别的名称">
                <Input defaultValue="示例名称" />
              </Form.Item>
              <Form.Item label="数量">
                <InputNumber defaultValue={12} suffix="个" />
              </Form.Item>
              <Form.Item label="类型">
                <FilterSelect
                  kind="enum"
                  options={[
                    { label: '普通', value: 'normal' },
                    { label: '特别', value: 'special' },
                  ]}
                  defaultValue="normal"
                />
              </Form.Item>
            </FormGrid>
          </Form>
          <QueryForm onSubmit={() => undefined}>
            <Form.Item label="时间范围">
              <DatePicker.RangePicker
                allowClear
                format={DATE_TIME_MINUTE_FORMAT}
                defaultValue={[
                  parseServerTime('2026-09-07T16:24:00+08:00'),
                  parseServerTime('2026-09-08T16:23:00+08:00'),
                ]}
              />
            </Form.Item>
          </QueryForm>
          <MultiSelect<number>
            label="范围"
            options={[
              { label: '北京', value: 1 },
              { label: '上海', value: 2 },
            ]}
            value={selected}
            onChange={setSelected}
          />
          <output aria-label="选择值类型">
            {selected.every((value) => typeof value === 'number') ? 'number' : 'invalid'}
          </output>
          <ViewSwitch
            defaultValue="enabled"
            options={[
              { label: '可用', value: 'enabled' },
              { label: '暂不可用', value: 'disabled', disabled: true },
            ]}
          />
          <TablePanel title="明细">
            <Table
              rowKey="id"
              dataSource={[
                { id: '1', amount: 12.5 },
                { id: '2', amount: 7.5 },
              ]}
              pagination={false}
              columns={[
                {
                  title: '名称',
                  key: 'name',
                  render: () => (
                    <Stack direction="column">
                      <ActionLink to="/example" variant="name" icon={<EditOutlined />}>
                        示例名称
                      </ActionLink>
                      <AtomicValue text={longIdentifier} />
                    </Stack>
                  ),
                },
                { title: '金额', dataIndex: 'amount', width: columnWidth.number },
              ]}
              summary={() => (
                <Table.Summary>
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0}>合计</Table.Summary.Cell>
                    <Table.Summary.Cell index={1}>20</Table.Summary.Cell>
                  </Table.Summary.Row>
                </Table.Summary>
              )}
            />
          </TablePanel>
          {auxiliary && (
            <TablePanel title="辅助列回归">
              <Table
                rowKey="id"
                pagination={false}
                order="given"
                dataSource={[
                  {
                    id: '1',
                    name: '业务记录',
                    status: '2 · upstream timeout',
                    user: 'student@example.com',
                  },
                ]}
                columns={[
                  { title: '名称', dataIndex: 'name' },
                  { title: '状态', dataIndex: 'status', width: columnWidth.text },
                  { title: '用户', dataIndex: 'user', width: columnWidth.code },
                ]}
                expandable={
                  auxiliary === 'expand' || auxiliary === 'both'
                    ? { expandedRowRender: () => <span>详情</span> }
                    : undefined
                }
                rowSelection={auxiliary === 'select' || auxiliary === 'both' ? {} : undefined}
              />
            </TablePanel>
          )}
          <Modal
            open={new URLSearchParams(window.location.search).has('modalViewport')}
            title="长内容弹窗"
            onCancel={() => undefined}
          >
            {Array.from({ length: 30 }, (_, index) => (
              <p key={index}>长正文第 {index + 1} 段</p>
            ))}
          </Modal>
          <SaveBar
            saving={new URLSearchParams(window.location.search).has('saving')}
            dirty={dirty}
            disabled={new URLSearchParams(window.location.search).has('disabled')}
            onSave={() => setDirty(false)}
            onCancel={() => setDirty(false)}
          />
        </PageStack>
      </AppPage>
    </main>
  );
}

function DrawerLifecycleFixture() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState('');
  const [events, setEvents] = useState<string[]>([]);
  return (
    <main className="contract-page">
      <Button
        onClick={() => {
          setSelected('record-123');
          setOpen(true);
          setEvents(['open-request']);
        }}
      >
        查看详情
      </Button>
      <output data-fixture="drawer-selection">{selected}</output>
      <output data-fixture="drawer-events">{JSON.stringify(events)}</output>
      <DetailDrawer
        title="记录详情"
        open={open}
        onClose={() => {
          setEvents((current) => [...current, `close-request:${selected}`]);
          setOpen(false);
        }}
        afterOpenChange={(visible) => {
          setEvents((current) => [...current, `after-open:${visible}:${selected}`]);
          if (!visible) setSelected('');
        }}
      >
        <p>{selected}</p>
        <section aria-label="抽屉原子长值" style={{ width: 174 }}>
          <AtomicValue text={longIdentifier} />
        </section>
      </DetailDrawer>
    </main>
  );
}

function BoundedContentFixture() {
  const [loading, setLoading] = useState(false);
  const [closed, setClosed] = useState(0);
  return (
    <main className="contract-page">
      <div style={{ width: 160 }} data-fixture="long-tags">
        <StatusTag icon={<EditOutlined />} tone="warning">
          热线实际状态暂不可确认
        </StatusTag>
        <MetadataTag closable onClose={() => setClosed((value) => value + 1)}>
          Independent development application with a long category name
        </MetadataTag>
      </div>
      <output data-fixture="tag-closed">{closed}</output>
      <Button onClick={() => setLoading((value) => !value)}>切换加载</Button>
      <div
        style={{ display: 'flex', flexDirection: 'column', height: 160 }}
        data-fixture="bounded-loading"
      >
        <LoadingOverlay fill loading={loading} label="正在读取">
          <div style={{ minHeight: 0, overflowY: 'auto' }} data-fixture="loading-content">
            {Array.from({ length: 30 }, (_, index) => (
              <p key={index}>候选记录 {index + 1}</p>
            ))}
          </div>
        </LoadingOverlay>
      </div>
      <div style={{ width: 174 }} data-fixture="contained-query">
        <QueryForm initialValues={{ name: '完整名称', category: 'a' }} onSubmit={() => undefined}>
          <Form.Item name="name" label="名称">
            <Input />
          </Form.Item>
          <Form.Item name="category" label="类别">
            <FilterSelect kind="enum" options={[{ value: 'a', label: '完整分类名称' }]} />
          </Form.Item>
        </QueryForm>
      </div>
      <div style={{ width: 174 }} data-fixture="contained-section-actions">
        <SectionHeader
          title="操作"
          extra={
            <ResponsiveActions>
              <Button icon={<PlusOutlined aria-hidden />}>新建</Button>
              <Button icon={<SaveOutlined />}>保存</Button>
              <Button icon={<CloseOutlined aria-hidden />}>取消</Button>
            </ResponsiveActions>
          }
        />
      </div>
      <div style={{ width: 174 }} data-fixture="contained-fields">
        <InformationFieldGrid
          items={[
            {
              key: 'identity',
              label: (
                <span>
                  完整目录账户字段名称<StatusTag tone="success">已采纳</StatusTag>
                </span>
              ),
              value: <AtomicValue text={longIdentifier} />,
            },
          ]}
        />
      </div>
      <div data-fixture="many-tabs">
        <ResponsiveTabs
          items={Array.from({ length: 10 }, (_, index) => ({
            key: String(index),
            label: `Long workspace category ${index + 1}`,
            children: <p>Workspace {index + 1}</p>,
          }))}
        />
      </div>
    </main>
  );
}

function DatePopupFixture() {
  const [selection, setSelection] = useState('');
  return (
    <main className="contract-page">
      <Form layout="vertical">
        <Form.Item label="日期">
          <DatePicker
            id="single-date"
            format={DATE_FORMAT}
            defaultValue={parseServerTime('2026-10-06T00:00:00+08:00')}
            onChange={(date) => setSelection(date?.format(DATE_FORMAT) ?? '')}
          />
        </Form.Item>
        <Form.Item label="日期范围">
          <DatePicker.RangePicker
            id={{ start: 'range-start', end: 'range-end' }}
            format={DATE_FORMAT}
            defaultValue={[
              parseServerTime('2026-10-06T00:00:00+08:00'),
              parseServerTime('2026-11-06T00:00:00+08:00'),
            ]}
            onChange={(dates) =>
              setSelection(dates?.map((date) => date?.format(DATE_FORMAT)).join(' / ') ?? '')
            }
          />
        </Form.Item>
        <Form.Item label="月份范围">
          <DatePicker.RangePicker picker="month" id={{ start: 'month-start', end: 'month-end' }} />
        </Form.Item>
        <Form.Item label="日期时间">
          <DatePicker id="date-time" showTime format={DATE_TIME_MINUTE_FORMAT} />
        </Form.Item>
      </Form>
      <output data-fixture="date-selection">{selection}</output>
    </main>
  );
}

const preservedTableRecords = [
  { id: 'first', name: 'Raw A' },
  { id: 'second', name: 'Raw B' },
];
function TableRenderFixture() {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(true);
  const [reversed, setReversed] = useState(false);
  return (
    <main className="contract-page">
      <Button icon={<EditOutlined />} onClick={() => setEnabled((value) => !value)}>
        切换外部状态
      </Button>
      <Button icon={<SwapOutlined aria-hidden />} onClick={() => setReversed((value) => !value)}>
        切换顺序
      </Button>
      <Button
        icon={<EditOutlined />}
        onClick={() => void i18n.changeLanguage(i18n.language === 'en-US' ? 'zh-CN' : 'en-US')}
      >
        切换语言
      </Button>
      <Table
        rowKey="id"
        pagination={false}
        order="given"
        dataSource={reversed ? [...preservedTableRecords].reverse() : preservedTableRecords}
        columns={[
          { title: '记录', dataIndex: 'name' },
          {
            title: '上下文',
            key: 'context',
            width: columnWidth.text,
            render: (_value, record, index) => (
              <span data-fixture={'context-' + record.id}>
                {record.name}:{index}:{t('common.actions.save')}:{enabled ? 'enabled' : 'disabled'}
              </span>
            ),
          },
          {
            title: '显式缓存',
            key: 'explicit',
            width: columnWidth.text,
            shouldCellUpdate: () => false,
            render: (_value, record) => (
              <span data-fixture={'explicit-' + record.id}>{enabled ? 'original' : 'changed'}</span>
            ),
          },
        ]}
      />
    </main>
  );
}

function SidebarFixture() {
  const [compact, setCompact] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [actions, setActions] = useState(0);
  const [loggingOut, setLoggingOut] = useState(false);
  return (
    <main className="contract-page">
      <Button
        icon={<EditOutlined aria-hidden />}
        onClick={() => {
          setSelected([]);
          setCompact((value) => !value);
        }}
      >
        切换侧栏
      </Button>
      <Layout.Sider width={240} collapsed={compact} trigger={null} theme="light">
        <div data-fixture="sidebar-top">
          <SidebarMenu
            compact={compact}
            selectedKeys={selected}
            onClick={() => setSelected(['top'])}
            items={[{ key: 'top', icon: <BookOutlined />, label: '上区项目' }]}
          />
        </div>
        <div data-fixture="sidebar-bottom">
          <SidebarMenu
            compact={compact}
            selectedKeys={selected}
            onClick={() => setSelected(['bottom'])}
            items={[{ key: 'bottom', icon: <BookOutlined />, label: '下区项目' }]}
          />
        </div>
        <AccountMenu
          name="测试用户"
          compact={compact}
          items={[{ key: 'profile', icon: <UserOutlined aria-hidden />, label: '个人信息' }]}
          onAction={() => setActions((value) => value + 1)}
          logout={{
            label: '退出登录',
            disabled: loggingOut,
            onClick: () => {
              setActions((value) => value + 1);
              setLoggingOut(true);
            },
          }}
        />
      </Layout.Sider>
      <output data-fixture="account-actions">{actions}</output>
    </main>
  );
}

function PaginationFixture() {
  const allRows = Array.from({ length: 101 }, (_, index) => ({
    id: String(index),
    name: `Row ${index + 1}`,
  }));
  const [total, setTotal] = useState(101);
  const [current, setCurrent] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const controller = useDataTable<{ id: string; name: string }, Record<string, never>>({
    initialFilters: {},
    request: async ({ current, pageSize }) => ({
      data: allRows.slice((current - 1) * pageSize, current * pageSize),
      total: 101,
    }),
  });
  const [sortableRows, setSortableRows] = useState(() => allRows.slice(0, 21));
  const columns = [{ title: 'Name', dataIndex: 'name' }];
  return (
    <main className="contract-page">
      <section aria-label="client pagination">
        <button onClick={() => setTotal(5)}>Shrink rows</button>
        <Table
          rowKey="id"
          order="given"
          columns={columns}
          dataSource={allRows.slice(0, total)}
          pagination={buildTablePagination({
            current,
            pageSize,
            total,
            onChange: (page, size) => {
              setCurrent(page);
              setPageSize(size);
            },
          })}
        />
      </section>
      <section aria-label="sortable pagination">
        <Table
          rowKey="id"
          order="given"
          columns={columns}
          dataSource={sortableRows}
          pagination={buildTablePagination()}
          sortable={{
            handleLabel: 'Reorder',
            onMove: (_row, from, to) =>
              setSortableRows((rows) => {
                const next = [...rows];
                const [item] = next.splice(from, 1);
                next.splice(to, 0, item);
                return next;
              }),
          }}
        />
        <output data-fixture="pagination-order">
          {sortableRows.map((row) => row.id).join(',')}
        </output>
      </section>
      <section aria-label="server pagination">
        <TablePanel>
          <DataTable controller={controller} rowKey="id" columns={columns} />
        </TablePanel>
      </section>
    </main>
  );
}

function EditFormFixture() {
  const [open, setOpen] = useState(true);
  const [saved, setSaved] = useState('');
  const params = new URLSearchParams(window.location.search);
  if (params.has('pageActions'))
    return (
      <PageFooterSlotProvider>
        {(slot) => (
          <main className="contract-page">
            <section aria-label="编辑正文">
              {Array.from({ length: 40 }, (_, index) => (
                <p key={index}>正文 {index + 1}</p>
              ))}
            </section>
            <SaveBar
              dirty
              onSave={() => undefined}
              onCancel={() => undefined}
              placement={params.has('footer') ? 'footer' : 'inline'}
            />
            {slot}
          </main>
        )}
      </PageFooterSlotProvider>
    );
  return (
    <main className="contract-page">
      <output aria-label="已保存内容">{saved}</output>
      <DrawerForm
        open={open}
        title="编辑记录"
        initialValues={{ name: '原值' }}
        onOpenChange={setOpen}
        onFinish={async (values) => {
          if (params.has('failure')) return false;
          setSaved(String(values.name));
          return true;
        }}
      >
        <Form.Item name="name" label="名称">
          <Input />
        </Form.Item>
      </DrawerForm>
    </main>
  );
}

/** 图表标签夹具只使用虚构数据，不依赖业务 API。 */
function ChartLabelFixture() {
  const shortNames = ['丰冬', '姜子牙', '欧阳文博', 'gpt-6-astra'];
  const longName = '超长姓名用于验证有限标签空间仍可查看完整内容'.repeat(12);
  return (
    <main className="contract-page">
      <section data-fixture="short-chart-labels">
        <BarList
          label="短名称"
          categories={shortNames}
          series={[{ name: '数量', data: [20, 15, 10, 5] }]}
          valueKind="integer"
          showValueLabel
        />
      </section>
      <section data-fixture="long-chart-labels">
        <BarList
          label="长名称"
          categories={[longName, '许小春']}
          series={[{ name: '数量', data: [20, 10] }]}
          valueKind="integer"
          showValueLabel
        />
      </section>
    </main>
  );
}

let filterCandidateAttempts = 0;
const filterCandidates = [
  { value: 'lin', label: 'Lin' },
  { value: 'chen', label: 'Chen' },
  {
    value: 'long',
    label: 'Very long user name · feedback-demo-with-a-long-identifier@example.invalid',
  },
];
const pendingFilterCandidates = new Map<string, (items: typeof filterCandidates) => void>();
async function loadFilterCandidates(keyword: string) {
  if (new URLSearchParams(window.location.search).has('filterRace') && keyword) {
    const result = await new Promise<typeof filterCandidates>((resolve) => {
      pendingFilterCandidates.set(keyword, resolve);
      window.dispatchEvent(new CustomEvent('filter-request', { detail: keyword }));
    });
    window.dispatchEvent(new CustomEvent('filter-completed', { detail: keyword }));
    return result;
  }
  if (
    new URLSearchParams(window.location.search).has('filterFailure') &&
    filterCandidateAttempts++ === 0
  )
    throw new Error('候选请求失败');
  return filterCandidates.filter((item) =>
    item.label.toLowerCase().includes(keyword.toLowerCase())
  );
}
function FilterSelectionFixture() {
  const [form] = Form.useForm();
  const [submitted, setSubmitted] = useState<unknown>();
  const [pending, setPending] = useState<string[]>([]);
  const [completed, setCompleted] = useState<string>('');
  useEffect(() => {
    const register = (event: Event) =>
      setPending((previous) => [...previous, (event as CustomEvent<string>).detail]);
    const acknowledge = (event: Event) => setCompleted((event as CustomEvent<string>).detail);
    window.addEventListener('filter-request', register);
    window.addEventListener('filter-completed', acknowledge);
    return () => {
      window.removeEventListener('filter-request', register);
      window.removeEventListener('filter-completed', acknowledge);
    };
  }, []);
  const zh = i18n.language === 'zh-CN';
  return (
    <ConfigProvider
      select={{
        classNames: {
          content: 'ds-select-content',
          itemContent: 'ds-select-tag-content',
          popup: { listItem: 'ds-select-option' },
        },
      }}
    >
      <main>
        <QueryForm form={form} onSubmit={setSubmitted}>
          <Form.Item name="users" label={zh ? '用户' : 'User'}>
            <FilterSelect
              kind="enum"
              options={[]}
              loadOptions={loadFilterCandidates}
              autoClearSearchValue={false}
            />
          </Form.Item>
          <Form.Item name="categories" label={zh ? '分类' : 'Category'}>
            <FilterSelect
              kind="enum"
              options={[
                { value: 'one', label: 'One' },
                { value: 'two', label: 'Two' },
              ]}
            />
          </Form.Item>
          <Form.Item name="enabled" label={zh ? '启用' : 'Enabled'}>
            <FilterSelect
              kind="pair"
              options={[
                { value: 'true', label: 'Yes' },
                { value: 'false', label: 'No' },
              ]}
            />
          </Form.Item>
          <Form.Item name="dateRange" label={zh ? '时间' : 'Time'}>
            <DatePicker.RangePicker allowClear />
          </Form.Item>
        </QueryForm>
        <button
          disabled={!pending.includes('selection')}
          onClick={() => form.setFieldValue('users', ['lin'])}
        >
          Select Lin
        </button>
        <button
          disabled={!pending.includes('old')}
          onClick={() =>
            pendingFilterCandidates.get('old')?.([{ value: 'lin', label: 'Old name' }])
          }
        >
          Finish old
        </button>
        <button
          disabled={!pending.includes('new')}
          onClick={() =>
            pendingFilterCandidates.get('new')?.([{ value: 'lin', label: 'New name' }])
          }
        >
          Finish new
        </button>
        <button
          disabled={!pending.includes('selection')}
          onClick={() =>
            pendingFilterCandidates.get('selection')?.([{ value: 'chen', label: 'Chen' }])
          }
        >
          Finish selection
        </button>
        <output data-testid="completed">{completed}</output>
        <output data-testid="submitted">
          {submitted === undefined ? 'pending' : JSON.stringify(submitted)}
        </output>
      </main>
    </ConfigProvider>
  );
}

/** 排序与完整详情只使用虚构数据，验证完整集合先排序再分页。 */
function OrderingDetailsFixture() {
  const [request, setRequest] = useState('');
  const names = Array.from({ length: 21 }, (_, i) => `Entity ${21 - i}`);
  const controller = useDataTable<{ name: string }, Record<string, never>>({
    initialFilters: {},
    initialSort: { field: 'name', order: 'ascend' },
    request: async (query) => {
      setRequest(JSON.stringify(query));
      const sorted = [...names].sort(
        (a, b) =>
          a.localeCompare(b, 'en', { numeric: true }) * (query.sort.order === 'descend' ? -1 : 1)
      );
      return {
        data: sorted
          .slice((query.current - 1) * query.pageSize, query.current * query.pageSize)
          .map((name) => ({ name })),
        total: sorted.length,
      };
    },
  });
  return (
    <main className="contract-page">
      <section aria-label="Ordering contract">
        <DataTable
          controller={controller}
          errorTitle="Loading failed"
          rowKey="name"
          columns={[{ title: 'Name', dataIndex: 'name' }]}
          ordering={{
            column: '#name',
            order: 'ascend',
            interactive: ['name'],
            reason: 'Name locates entities; no categorical ranking',
          }}
        />
        <output data-testid="sort-request">{request}</output>
      </section>
      <section aria-label="Responsive details">
        <InformationFieldGrid
          compact
          items={[
            {
              key: 'name',
              label: 'Name',
              value: <AtomicValue text={'continuous-identifier-'.repeat(20)} />,
            },
            {
              key: 'status',
              label: 'Status',
              value: <StatusTag tone="success">{'complete-status-'.repeat(8)}</StatusTag>,
            },
            { key: 'time', label: 'Created', value: '2026/10/13 12:30:00' },
            { key: 'type', label: 'Type', value: 'Shared' },
            { key: 'owner', label: 'Owner', value: 'Example' },
            { key: 'count', label: 'Count', value: 12 },
          ]}
        />
      </section>
    </main>
  );
}
