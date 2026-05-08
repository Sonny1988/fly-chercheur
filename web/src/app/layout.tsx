import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FlySearch — Chercheur de vols intelligent',
  description: 'Trouvez les vols les moins chers avec 13 modules d\'analyse IA — dates flexibles, miles, routes alternatives, promos en temps réel.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
