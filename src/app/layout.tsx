import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import type { ReactNode } from 'react';
import { COR_TEMA } from '@/lib/manifesto';
import './globals.css';

const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-plex-sans',
});
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '600'],
  variable: '--font-plex-mono',
});

export const metadata: Metadata = {
  title: 'Gestão de Devoluções',
  description: 'Sistema de gestão de devoluções dos marketplaces',
  applicationName: 'Gestão de Devoluções',
  appleWebApp: { capable: true, title: 'Devoluções', statusBarStyle: 'default' },
};

/** viewport-fit=cover libera env(safe-area-inset-*) para a barra de abas não ficar sob o gesto do iPhone. */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: COR_TEMA,
};

export default function LayoutRaiz({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={`${plexSans.variable} ${plexMono.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
