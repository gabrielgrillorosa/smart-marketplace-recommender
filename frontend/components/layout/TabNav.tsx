'use client';

import { useRef } from 'react';

export type TabId = 'catalog' | 'analysis' | 'chat';

interface Tab {
  id: TabId;
  label: string;
  icon: string;
}

const TABS: Tab[] = [
  { id: 'catalog', label: 'Catálogo', icon: '📦' },
  { id: 'analysis', label: 'Análise', icon: '📊' },
  { id: 'chat', label: 'Chat RAG', icon: '💬' },
];

interface TabNavProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

export function TabNav({ activeTab, onTabChange }: TabNavProps) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function moveFocus(currentIndex: number, direction: 'next' | 'prev' | 'first' | 'last') {
    const total = TABS.length;
    let targetIndex = currentIndex;
    if (direction === 'next') {
      targetIndex = (currentIndex + 1) % total;
    } else if (direction === 'prev') {
      targetIndex = (currentIndex - 1 + total) % total;
    } else if (direction === 'first') {
      targetIndex = 0;
    } else if (direction === 'last') {
      targetIndex = total - 1;
    }
    const targetTab = TABS[targetIndex];
    onTabChange(targetTab.id);
    tabRefs.current[targetIndex]?.focus();
  }

  return (
    <nav className="border-b bg-white px-6" aria-label="Navegação principal">
      <div className="mx-auto flex max-w-7xl gap-1" role="tablist" aria-orientation="horizontal">
        {TABS.map((tab, index) => (
          <button
            key={tab.id}
            ref={(element) => {
              tabRefs.current[index] = element;
            }}
            id={`tab-${tab.id}`}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => onTabChange(tab.id)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight') {
                event.preventDefault();
                moveFocus(index, 'next');
              } else if (event.key === 'ArrowLeft') {
                event.preventDefault();
                moveFocus(index, 'prev');
              } else if (event.key === 'Home') {
                event.preventDefault();
                moveFocus(index, 'first');
              } else if (event.key === 'End') {
                event.preventDefault();
                moveFocus(index, 'last');
              }
            }}
            className={`flex min-h-[44px] items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
            data-testid={`main-tab-${tab.id}`}
          >
            <span aria-hidden="true">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
