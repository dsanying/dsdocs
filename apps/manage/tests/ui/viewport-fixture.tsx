import { createRoot } from 'react-dom/client';
import { ViewportFrame, SidebarFrame, ScrollRegion } from '../../src/components/ui';
import '../../src/design/tokens.css';
import './viewport-fixture.css';
const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get('theme') ?? 'light';
const rows = Array.from({ length: 80 }, (_, i) => <p key={i}>内容 {i + 1}</p>);
const body = (
  <div className="viewport-fixture-grid">
    <aside>
      <SidebarFrame
        header={<h1>产品</h1>}
        footer={
          <div className="viewport-fixture-footer">
            当前账号
            <br />
            主题切换
          </div>
        }
        label="主导航"
      >
        {rows}
      </SidebarFrame>
    </aside>
    <section className="viewport-fixture-main">
      <header>固定操作区</header>
      <ScrollRegion label="主内容" axis="y" className="viewport-fixture-scroll">
        {rows}
      </ScrollRegion>
    </section>
  </div>
);
createRoot(document.getElementById('root')!).render(
  params.has('broken') ? <div>{body}</div> : <ViewportFrame>{body}</ViewportFrame>
);
