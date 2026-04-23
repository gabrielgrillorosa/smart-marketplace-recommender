import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Smart Marketplace Recommender',
  description: 'AI-powered product recommendations for B2B marketplace clients',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
