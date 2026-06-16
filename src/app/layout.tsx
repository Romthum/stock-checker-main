import type { Metadata } from 'next';
import './globals.css';
import { I18nProvider } from '@/lib/i18n';

export const metadata: Metadata = {
  title: 'Peak World Toy POS',
  description: 'Peak World Toy POS and stock management system',
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className="h-full" suppressHydrationWarning>
      <body className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 antialiased">
        <I18nProvider>
          <main className="mx-auto w-full max-w-5xl px-3 py-4">{children}</main>
        </I18nProvider>
      </body>
    </html>
  );
}
