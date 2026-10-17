import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import '@/i18n';
import './design/tokens.css';
import './global.css';
import { App } from '@/App';
import { bootstrapPersistedTheme } from '@/stores/useThemeStore';
import { installOverflowScroll } from '@/components/ui';

// React 挂载前应用持久化主题偏好，避免首帧闪白/闪黑。
bootstrapPersistedTheme();

// 单行内容的横向滚动槽位只在真放不下时才可滚（含弹层，故挂在 body 上）。
installOverflowScroll(document.body);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename="/">
      <App />
    </BrowserRouter>
  </StrictMode>
);
