import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Local POS',
  description: 'Self-hosted POS and stock management system',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className="h-full" suppressHydrationWarning>
      <body className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 antialiased">
        <main className="mx-auto w-full max-w-5xl px-3 py-4">{children}</main>
      </body>
    </html>
  );
}
