import type { Metadata } from 'next';
import './globals.css';
import { ClientProvider } from '@/lib/contexts/ClientContext';
import { RecommendationProvider } from '@/lib/contexts/RecommendationContext';

export const metadata: Metadata = {
  title: 'Smart Marketplace Recommender',
  description: 'AI-powered product recommendations for B2B marketplace clients',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-background font-sans antialiased">
        <ClientProvider>
          <RecommendationProvider>{children}</RecommendationProvider>
        </ClientProvider>
      </body>
    </html>
  );
}
