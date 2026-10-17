import { CheckOutlined, ReloadOutlined, SwapOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { Button, ConfigProvider, Input } from 'antd';
import { useCallback, useRef, useState } from 'react';
import { FilterSelect, RemoteSelect } from '../../src/components/ui';
import { useRemoteOptions, type RemoteOption } from '../../src/hooks/useRemoteOptions';

const longLabel = `long-candidate-${'pool-name/'.repeat(150)}`;
const candidateOptions = [
  { value: 'short', label: '短候选 Short candidate' },
  { value: 'long', label: longLabel },
  { value: 'other', label: '其他候选 Other candidate' },
  ...Array.from({ length: 30 }, (_, index) => ({
    value: `extra-${index}`,
    label: `候选 ${index}`,
  })),
];
const loadCandidates = async () => candidateOptions;
const searchCandidates = async (keyword: string) =>
  candidateOptions.filter((option) => option.label.includes(keyword));
const attempts = new Map<string, number>();
const remoteCandidates = async (kind: string) => {
  const count = attempts.get(kind) ?? 0;
  attempts.set(kind, count + 1);
  if (new URLSearchParams(window.location.search).has('remoteFailure') && count === 0)
    throw new Error('候选读取失败');
  return candidateOptions;
};
const loadSingleCandidates = () => remoteCandidates('single');
const loadFreeCandidates = () => remoteCandidates('free');

function RequestScopeFixture() {
  const [scope, setScope] = useState('A');
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<RemoteOption[]>([]);
  const [reads, setReads] = useState<string[]>([]);
  const pending = useRef<Array<() => void>>([]);
  const load = useCallback(
    async (keyword: string) => {
      setReads((current) => [...current, `${scope}:${keyword}`]);
      if (keyword === 'slow' || scope === 'B')
        await new Promise<void>((resolve) => pending.current.push(resolve));
      return [{ value: 'shared', label: `${scope}:${keyword || 'initial'}` }];
    },
    [scope]
  );
  const remote = useRemoteOptions(load, selected, [revision]);
  return (
    <section aria-label="候选请求作用域">
      <Input
        aria-label="候选关键词"
        value={remote.keyword}
        onChange={(event) => remote.onSearch(event.target.value)}
      />
      <Button
        icon={<CheckOutlined />}
        onClick={() => setSelected([{ value: 'shared', label: 'fallback' }])}
      >
        保留已选实体
      </Button>
      <Button icon={<SwapOutlined />} onClick={() => setScope('B')}>
        切换作用域
      </Button>
      <Button icon={<ReloadOutlined />} onClick={() => setRevision((value) => value + 1)}>
        刷新相同加载器作用域
      </Button>
      <Button
        icon={<PlayCircleOutlined />}
        onClick={() => {
          pending.current.splice(0).forEach((resolve) => resolve());
        }}
      >
        释放待完成响应
      </Button>
      <output aria-label="候选读取记录">{JSON.stringify(reads)}</output>
      <output aria-label="当前候选">{JSON.stringify(remote.options)}</output>
    </section>
  );
}

/** 使用与真实应用相同的候选语义槽；每个候选有独立横滚区域。 */
export function SelectCandidatesFixture() {
  return (
    <ConfigProvider
      popupMatchSelectWidth
      select={{
        classNames: {
          content: 'ds-select-content',
          itemContent: 'ds-select-tag-content',
          popup: { listItem: 'ds-select-option' },
        },
      }}
    >
      <main>
        <h1>长候选与请求作用域</h1>
        <section aria-label="候选弹层" style={{ width: '240px', maxWidth: '100%' }}>
          <FilterSelect aria-label="静态候选" kind="enum" options={candidateOptions} />
          <FilterSelect
            aria-label="远程筛选候选"
            kind="enum"
            options={[]}
            loadOptions={loadCandidates}
          />
          <RemoteSelect aria-label="远程单选候选" loadOptions={loadSingleCandidates} />
          <RemoteSelect aria-label="远程输入候选" freeText loadOptions={loadFreeCandidates} />
        </section>
        <section aria-label="关键词远程筛选" style={{ width: '240px', maxWidth: '100%' }}>
          <FilterSelect
            aria-label="关键词远程筛选"
            kind="enum"
            options={[]}
            loadOptions={searchCandidates}
          />
        </section>
        <RequestScopeFixture />
      </main>
    </ConfigProvider>
  );
}
