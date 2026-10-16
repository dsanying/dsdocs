import '../../../../packages/content/prose.css';
import './globals.css';
export const metadata = { title: 'DSdocs' };
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
