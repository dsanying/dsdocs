import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  CopyOutlined,
  MinusCircleOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  DatePicker,
  Descriptions,
  Drawer,
  Input,
  Progress,
  Segmented,
  Select,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { useState } from 'react';
import { DATE_FORMAT } from '../../src/utils/dateTime';
import {
  ActionLink,
  AtomicValue,
  DetailDrawer,
  HelpTip,
  IconButton,
  InformationFieldGrid,
  LongText,
  MetadataTag,
  MultiSelect,
  QueryFeedback,
  RangePicker,
  RatioProgress,
  SearchInput,
  StatusTag,
  SummaryStrip,
  Table as SharedTable,
  TablePanel,
  ViewSwitch,
} from '../../src/components/ui';

const pair = (title: string, ours: React.ReactNode, native: React.ReactNode, note: string) => (
  <section key={title} aria-label={title} style={{ marginBlockEnd: 48 }}>
    <h2 style={{ marginBlockEnd: 4 }}>{title}</h2>
    <p style={{ color: 'var(--ds-color-text-tertiary)', marginBlockEnd: 12, fontSize: 12 }}>
      {note}
    </p>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
      <div style={{ border: '1px dashed var(--ds-color-border)', borderRadius: 8, padding: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--ds-color-text-tertiary)', marginBlockEnd: 8 }}>
          当前：项目共享组件
        </div>
        {ours}
      </div>
      <div style={{ border: '1px dashed var(--ds-color-border)', borderRadius: 8, padding: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--ds-color-text-tertiary)', marginBlockEnd: 8 }}>
          对照：Ant 原生
        </div>
        {native}
      </div>
    </div>
  </section>
);

const switchOptions = [
  { value: 'overview', label: '总览' },
  { value: 'group', label: '按分组查看完整统计' },
  { value: 'group', label: '按分组查看' },
];
const iconOptions = [
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
];

const tableColumns = [
  { title: '名称', dataIndex: 'name' },
  { title: '状态', dataIndex: 'status' },
  { title: '用量', dataIndex: 'usage', align: 'right' as const },
];
const tableRows = [
  { key: '1', name: 'item-prod', status: '启用', usage: '¥ 1,234.5' },
  { key: '2', name: 'item-dev', status: '启用', usage: '¥ 56.0' },
  { key: '3', name: 'a-very-long-item-name-that-overflows', status: '停用', usage: '¥ 0' },
];

const fieldItems = [
  { key: 'status', label: '处理状态', value: '待处理' },
  { key: 'date', label: '发布时间', value: '2026/10/12 12:34' },
  {
    key: 'title',
    label: '通知标题',
    value: 'A complete English notification title',
    span: 'full' as const,
  },
];

const multiOptions = [
  { value: 'admin', label: '管理员' },
  { value: 'editor', label: '编辑' },
  { value: 'viewer', label: '访客' },
  { value: 'auditor', label: '审计员' },
];

function MultiSelectPair() {
  const [ours, setOurs] = useState<string[]>(['admin', 'editor']);
  const [native, setNative] = useState<string[]>(['admin', 'editor']);
  return pair(
    '多选控件',
    <MultiSelect label="角色" value={ours} onChange={setOurs} options={multiOptions} />,
    <Select
      mode="multiple"
      value={native}
      onChange={setNative}
      options={multiOptions}
      style={{ width: '100%' }}
    />,
    '自制：一行行内展示已选、点击进弹窗勾选（全量候选、完整标签）；原生：Select multiple 标签内联堆叠'
  );
}

function RangePickerPair() {
  // 窄屏才见分晓的对照：不用双列网格（双列在 360px 下把两边各压到 ~150px，组件被容器挤残），上下通栏各占整行
  return (
    <section aria-label="时间范围弹层（窄屏才见分晓）" style={{ marginBlockEnd: 48 }}>
      <h2 style={{ marginBlockEnd: 4 }}>时间范围弹层（窄屏才见分晓）</h2>
      <p style={{ color: 'var(--ds-color-text-tertiary)', marginBlockEnd: 12, fontSize: 12 }}>
        上：裸 DatePicker.RangePicker——无快捷预设、无弹层防越界，320px 下双月面板弹出视口外被裁；
        下：共享 RangePicker（查询表单/导出弹窗/FieldDatePicker
        同款加固）——弹层限宽+区内横滚+视口内平移+近7/30/90 天预设。 把窗口缩到 ~360px
        再点开输入框看弹层位置
      </p>
      <div style={{ display: 'grid', gap: 16 }}>
        <div style={{ border: '1px dashed var(--ds-color-border)', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--ds-color-text-tertiary)', marginBlockEnd: 8 }}>
            对照：Ant 原生裸 RangePicker
          </div>
          <DatePicker.RangePicker allowClear format={DATE_FORMAT} />
        </div>
        <div style={{ border: '1px dashed var(--ds-color-border)', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--ds-color-text-tertiary)', marginBlockEnd: 8 }}>
            当前：共享 RangePicker（查询表单唯一入口）
          </div>
          <RangePicker allowClear />
        </div>
      </div>
    </section>
  );
}

function DrawerPair() {
  const [oursOpen, setOursOpen] = useState(false);
  const [nativeOpen, setNativeOpen] = useState(false);
  // antd 6 resizable 与显式 size 互斥（size 优先于拖拽结果），必须走受控宽度：resizable.onResize 回写 size
  const [drawerSize, setDrawerSize] = useState(736);
  const body = (
    <div style={{ display: 'grid', gap: 8 }}>
      {Array.from({ length: 8 }, (_, i) => (
        <AtomicValue key={i} text={`rule-${i}-` + '0123456789abcdef'.repeat(3)} />
      ))}
    </div>
  );
  return (
    <section aria-label="详情抽屉（拖拽调宽）" style={{ marginBlockEnd: 48 }}>
      <h2 style={{ marginBlockEnd: 4 }}>详情抽屉（拖拽调宽）</h2>
      <p style={{ color: 'var(--ds-color-text-tertiary)', marginBlockEnd: 12, fontSize: 12 }}>
        左：DetailDrawer——已内建 resizable（语义 size 折算初始像素 + resizable.onResize
        受控回写，Ant resizable 与显式 size 直用互斥）；右：Ant 6
        原生手工接线对照。分别点开，拖抽屉左缘
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div style={{ border: '1px dashed var(--ds-color-border)', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--ds-color-text-tertiary)', marginBlockEnd: 8 }}>
            当前：DetailDrawer（已内建拖拽调宽）
          </div>
          <Button onClick={() => setOursOpen(true)}>打开抽屉</Button>
        </div>
        <div style={{ border: '1px dashed var(--ds-color-border)', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--ds-color-text-tertiary)', marginBlockEnd: 8 }}>
            对照：Ant 6 原生 Drawer resizable
          </div>
          <Button onClick={() => setNativeOpen(true)}>打开抽屉</Button>
        </div>
      </div>
      <DetailDrawer title="规则明细" open={oursOpen} onClose={() => setOursOpen(false)}>
        {body}
      </DetailDrawer>
      <Drawer
        title="规则明细"
        open={nativeOpen}
        onClose={() => setNativeOpen(false)}
        size={drawerSize}
        destroyOnHidden
        resizable={{ onResize: setDrawerSize }}
      >
        {body}
      </Drawer>
    </section>
  );
}

export function NativeCompareFixture() {
  return (
    <main className="contract-page" style={{ maxWidth: 1100 }}>
      <h1>自制组件 × Ant 原生对照</h1>
      {pair(
        '视图切换（图中形态 1：文字）',
        <ViewSwitch options={switchOptions} defaultValue="overview" />,
        <Segmented options={switchOptions} defaultValue="overview" />,
        '自制 = Segmented + 描边轨道/弱底药丸/主色字；原生裸 Segmented 灰轨道+白药丸'
      )}
      {pair(
        '视图切换（图中形态 2：纯图标）',
        <ViewSwitch options={iconOptions} defaultValue="allow" />,
        <Segmented
          options={iconOptions.map((o) => ({ value: o.value, label: o.label }))}
          defaultValue="allow"
        />,
        '语义色图标（允许/拒绝）在两种底上的表现'
      )}
      {pair(
        '状态标签',
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <StatusTag tone="success">启用</StatusTag>
          <StatusTag tone="warning">待处理</StatusTag>
          <StatusTag tone="error">已拒绝</StatusTag>
          <StatusTag tone="info">同步中</StatusTag>
          <MetadataTag>分类标签</MetadataTag>
        </div>,
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Tag color="success">启用</Tag>
          <Tag color="warning">待处理</Tag>
          <Tag color="error">已拒绝</Tag>
          <Tag color="processing">同步中</Tag>
          <Tag>分类标签</Tag>
        </div>,
        '自制：语义 tone 走 --ds 状态色弱底；原生：Tag 预设色'
      )}
      {pair(
        '图标按钮',
        <div style={{ display: 'flex', gap: 8 }}>
          <IconButton label="复制标识符" icon={<CopyOutlined />} />
          <IconButton label="复制标识符" icon={<CopyOutlined />} type="text" />
        </div>,
        <div style={{ display: 'flex', gap: 8 }}>
          <Button aria-label="复制标识符" icon={<CopyOutlined />} />
          <Button aria-label="复制标识符" icon={<CopyOutlined />} type="text" />
        </div>,
        '自制只是强制 aria-label 的 Button 透传——视觉与原生一致'
      )}
      {pair(
        '行内链接操作',
        <ActionLink to="#" icon={<CopyOutlined />}>
          查看详情
        </ActionLink>,
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Button type="link" size="small" icon={<CopyOutlined />}>
            查看详情
          </Button>
          <Typography.Link>
            <CopyOutlined /> 查看详情
          </Typography.Link>
        </div>,
        '自制 ActionLink（react-router Link）；原生：Button link / Typography.Link'
      )}
      {pair(
        '搜索输入',
        <SearchInput
          aria-label="检索词"
          hint="按空格拆分多个关键词，全部命中才显示"
          placeholder="搜索"
        />,
        <Input.Search aria-label="检索词" placeholder="搜索" allowClear />,
        '自制：Input + 提示图标（Enter 触发）；原生：Input.Search 带按钮/回车'
      )}
      {pair(
        '指标条',
        <SummaryStrip
          label="继承关系"
          items={[
            { key: 'parents', label: '直接父标签', value: 1 },
            { key: 'children', label: '直接子标签', value: 0 },
            { key: 'status', label: '继承状态', value: '关系正常' },
          ]}
        />,
        <div style={{ display: 'flex', gap: 32 }}>
          <Statistic title="直接父标签" value={1} />
          <Statistic title="直接子标签" value={0} />
          <Statistic title="继承状态" value="关系正常" />
        </div>,
        '自制：小字标签+指标字数值+竖线分隔+均衡分列；原生：Statistic 逐个摆'
      )}
      {pair(
        '详情字段网格',
        <InformationFieldGrid compact items={fieldItems} />,
        <Descriptions
          size="small"
          column={3}
          items={fieldItems.map((f) => ({
            key: String(f.key),
            label: f.label,
            children: f.value,
            span: f.span === 'full' ? 3 : 1,
          }))}
        />,
        '自制：响应式列数、紧凑/通栏槽位、长值横滚；原生：Descriptions'
      )}
      {pair(
        '表格面板',
        <TablePanel title="资源列表">
          <SharedTable columns={tableColumns} dataSource={tableRows} pagination={false} />
        </TablePanel>,
        <Table columns={tableColumns} dataSource={tableRows} pagination={false} size="middle" />,
        '自制：标题行+查询条+汇总槽位、表头贴边无框；原生：Table 默认卡片边界'
      )}
      <MultiSelectPair />
      {pair(
        '占比进度',
        <div style={{ maxWidth: 320 }}>
          <RatioProgress
            label="已用额度"
            value={382.5}
            total={1234.567}
            format={(n) => `¥ ${n.toFixed(1)}`}
          />
        </div>,
        <div style={{ maxWidth: 320 }}>
          <Progress percent={31} size="small" />
          <span style={{ fontSize: 12 }}>¥ 382.5 / ¥ 1234.6 31.0%</span>
        </div>,
        '自制：文字「值/总量 + %」加同宽细条；原生：Progress + 文字自拼'
      )}
      {pair(
        '长文本单元格',
        <div style={{ maxWidth: 320 }}>
          <LongText label="说明">{'非常长的单元格说明文本'.repeat(10)}</LongText>
        </div>,
        <div style={{ maxWidth: 320 }}>
          <Typography.Paragraph ellipsis={{ rows: 1, tooltip: true }} style={{ margin: 0 }}>
            {'非常长的单元格说明文本'.repeat(10)}
          </Typography.Paragraph>
        </div>,
        '自制：单行格内横滚保留全文；原生替代：Typography ellipsis（截断省略号）'
      )}
      {pair(
        '查询失败反馈',
        <QueryFeedback
          error={{ response: { status: 503, data: { message: 'service unavailable' } } }}
          errorTitle="加载失败"
          retryLabel="重试"
          onRetry={() => {}}
        />,
        <Alert
          type="error"
          message="加载失败"
          description="service unavailable"
          showIcon
          action={<Button size="small">重试</Button>}
        />,
        '自制：错误清洗（不泄露服务端 HTML/密钥形态）+ 重试布局；原生：Alert'
      )}
      {pair(
        '字段帮助提示',
        <HelpTip title="这是字段级帮助说明，挂 Form.Item 标签旁" />,
        <Tooltip title="这是字段级帮助说明，挂 Form.Item 标签旁">
          <QuestionCircleOutlined style={{ color: 'var(--ds-color-text-tertiary)' }} />
        </Tooltip>,
        '自制 = 统一样式的 Tooltip+图标入口；原生即 Tooltip'
      )}
      {pair(
        '标识符原子值',
        <AtomicValue text={'item-' + '0123456789abcdef'.repeat(4)} />,
        <Typography.Text copyable code>
          {'item-' + '0123456789abcdef'.repeat(4)}
        </Typography.Text>,
        '自制：单框完整展示+有界横滚+复制；规范禁用 Typography copyable/code（双框）'
      )}
      <RangePickerPair />
      <DrawerPair />
    </main>
  );
}
