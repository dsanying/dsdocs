import { BulbOutlined, ReloadOutlined } from '@ant-design/icons';
import { App as AntdApp, ConfigProvider, Form } from 'antd';
import enUS from 'antd/locale/en_US';
import zhCN from 'antd/locale/zh_CN';
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { MemoryRouter } from 'react-router';

import { buildThemeConfig } from '../../src/config/theme';
import i18n from '../../src/i18n';
import { useThemeStore } from '../../src/stores/useThemeStore';
import {
  AtomicValue,
  FilterSelect,
  IconButton,
  IconLabelHint,
  LoadingOverlay,
  ResponsiveTabs,
  installOverflowScroll,
  modalDefaults,
} from '../../src/components/ui';

import '../../src/design/tokens.css';
import '../../src/global.css';
import './tabs-fill-fixture.css';

const parameters = new URLSearchParams(window.location.search);
const copyByLanguage = {
  'zh-CN': {
    title: '候选页签填满容器',
    candidates: '候选人员',
    selected: '已选人员',
    candidate: '候选',
    available: '可排',
    term: '学期',
    first: '第一学期',
    second: '第二学期',
    scope: '当前范围',
    selection: '选项统计',
    theme: '切换主题',
    loading: '切换加载',
    reading: '正在读取候选',
  },
  'en-US': {
    title: 'Bounded candidate tabs',
    candidates: 'Candidates',
    selected: 'Selected',
    candidate: 'Candidate',
    available: 'Available',
    term: 'Term',
    first: 'First term',
    second: 'Second term',
    scope: 'Current scope',
    selection: 'Selection',
    theme: 'Toggle theme',
    loading: 'Toggle loading',
    reading: 'Reading candidates',
  },
};

export function TabsFillFixture() {
  const { i18n: translator } = useTranslation();
  const language = translator.resolvedLanguage === 'en-US' ? 'en-US' : 'zh-CN';
  const copy = copyByLanguage[language];
  const theme = useThemeStore((state) => state.mode);
  const [term, setTerm] = useState('first');
  const [selected, setSelected] = useState<number[]>([]);
  const [clicks, setClicks] = useState(0);
  const [loading, setLoading] = useState(false);
  const candidateName = (index: number) => `${copy.candidate} ${String(index).padStart(2, '0')}`;
  const toggleCandidate = (index: number) => {
    setSelected((current) =>
      current.includes(index) ? current.filter((value) => value !== index) : [...current, index]
    );
    setClicks((current) => current + 1);
  };
  const candidate = (index: number) => (
    <div role="listitem" key={index}>
      <button
        className="tabs-fill-fixture__choice"
        type="button"
        aria-label={candidateName(index)}
        aria-pressed={selected.includes(index)}
        onClick={() => toggleCandidate(index)}
      >
        <AtomicValue text={candidateName(index)} />
        <span>{copy.available}</span>
      </button>
    </div>
  );
  const semanticClasses = { body: 'tabs-fill-user-body', content: 'tabs-fill-user-content' };
  const semanticStyles = {
    body: { backgroundColor: 'var(--ds-color-surface)' },
    content: { color: 'var(--ds-color-text)' },
  };

  return (
    <ConfigProvider
      theme={buildThemeConfig(theme)}
      locale={language === 'en-US' ? enUS : zhCN}
      modal={modalDefaults}
    >
      <AntdApp>
        <IconLabelHint />
        <main className="tabs-fill-fixture">
          <h1>{copy.title}</h1>
          <section className="tabs-fill-fixture__boundary" aria-label={copy.title}>
            <ResponsiveTabs
              fill
              classNames={
                parameters.get('semantics') === 'callback' ? () => semanticClasses : semanticClasses
              }
              styles={
                parameters.get('semantics') === 'callback' ? () => semanticStyles : semanticStyles
              }
              items={[
                {
                  key: 'candidates',
                  label: copy.candidates,
                  forceRender: true,
                  children: (
                    <div className="tabs-fill-fixture__pane">
                      <Form layout="vertical" className="tabs-fill-fixture__scope">
                        <Form.Item label={copy.term} htmlFor="tabs-fill-term">
                          <FilterSelect
                            id="tabs-fill-term"
                            aria-label={copy.term}
                            kind="scope"
                            value={term}
                            options={[
                              { value: 'first', label: copy.first },
                              { value: 'second', label: copy.second },
                            ]}
                            onChange={(value) => setTerm(String(value))}
                          />
                        </Form.Item>
                      </Form>
                      <div className="tabs-fill-fixture__results">
                        <LoadingOverlay fill loading={loading} label={copy.reading}>
                          <div
                            className="tabs-fill-fixture__list"
                            role="list"
                            aria-label={copy.candidates}
                            tabIndex={0}
                          >
                            {Array.from({ length: 40 }, (_, index) => candidate(index + 1))}
                          </div>
                        </LoadingOverlay>
                      </div>
                    </div>
                  ),
                },
                {
                  key: 'selected',
                  label: copy.selected,
                  forceRender: true,
                  children: (
                    <div className="tabs-fill-fixture__pane">
                      <div
                        className="tabs-fill-fixture__list"
                        role="list"
                        aria-label={copy.selected}
                        tabIndex={0}
                      >
                        {selected.map(candidate)}
                      </div>
                    </div>
                  ),
                },
              ]}
            />
          </section>
          <footer className="tabs-fill-fixture__footer">
            <IconButton
              label={copy.theme}
              icon={<BulbOutlined />}
              onClick={() => useThemeStore.getState().toggle()}
            />
            <IconButton
              label={copy.loading}
              icon={<ReloadOutlined />}
              onClick={() => setLoading((value) => !value)}
            />
            <output aria-label={copy.scope}>{term === 'first' ? copy.first : copy.second}</output>
            <output aria-label={copy.selection} data-clicks={clicks}>
              {selected.map(candidateName).join(', ') || '—'}
            </output>
          </footer>
        </main>
      </AntdApp>
    </ConfigProvider>
  );
}

async function mount() {
  await i18n.changeLanguage(parameters.get('lang') === 'en-US' ? 'en-US' : 'zh-CN');
  useThemeStore.getState().setPreference(parameters.get('theme') === 'dark' ? 'dark' : 'light');
  installOverflowScroll(document.body);
  console.info('[tabs-fill-fixture] initialized');
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <TabsFillFixture />
        </MemoryRouter>
      </I18nextProvider>
    </StrictMode>
  );
}

void mount();
