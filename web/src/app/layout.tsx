import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FlightScanner AI — Trouve les vols les moins chers',
  description: 'Analyse intelligente de vols avec IA — 8 outils pour voyager moins cher',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
