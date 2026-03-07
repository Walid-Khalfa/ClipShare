import type { Metadata, Viewport } from 'next';
import { JetBrains_Mono, Outfit } from 'next/font/google';
import './globals.css';

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Clipshare - Screen Recording & Sharing',
  description: 'Record your screen, camera, and microphone. Share instantly with a link.',
  keywords: ['screen recording', 'video', 'sharing', '录屏', '分享'],
  authors: [{ name: 'Clipshare' }],
  icons: {
    icon: '/favicon.svg',
  },
  openGraph: {
    title: 'Clipshare - Screen Recording & Sharing',
    description: 'Record your screen, camera, and microphone. Share instantly with a link.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0f172a',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${jetbrainsMono.variable} ${outfit.variable}`}>
      <head>
        <meta name="theme-color" content="#0f172a" />
      </head>
      <body className="antialiased font-sans">
        {children}
      </body>
    </html>
  );
}
