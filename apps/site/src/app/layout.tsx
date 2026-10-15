import './globals.css';
import { config } from '@/core/config';
export const metadata = {
  title: { default: config.title, template: `%s · ${config.title}` },
  description: 'Documentation powered by dsdocs',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
