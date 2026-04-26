'use client';

import { useState } from 'react';
import { Header } from '@/components/layout/Header';
import { TabNav, type TabId } from '@/components/layout/TabNav';
import { CatalogPanel } from '@/components/catalog/CatalogPanel';
import { AnalysisPanel } from '@/components/recommendations/AnalysisPanel';
import { RAGChatPanel } from '@/components/chat/RAGChatPanel';

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabId>('catalog');

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <Header />
      <TabNav activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6">
        {activeTab === 'catalog' && <CatalogPanel />}
        {activeTab === 'analysis' && <AnalysisPanel />}
        {activeTab === 'chat' && <RAGChatPanel />}
      </main>
    </div>
  );
}
