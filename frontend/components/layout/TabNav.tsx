'use client';

export type TabId = 'catalog' | 'client' | 'recommendations' | 'chat';

interface Tab {
  id: TabId;
  label: string;
  icon: string;
}

const TABS: Tab[] = [
  { id: 'catalog', label: 'Catálogo', icon: '📦' },
  { id: 'client', label: 'Cliente', icon: '👤' },
  { id: 'recommendations', label: 'Recomendações', icon: '⭐' },
  { id: 'chat', label: 'Chat RAG', icon: '💬' },
];

interface TabNavProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

export function TabNav({ activeTab, onTabChange }: TabNavProps) {
  return (
    <nav className="border-b bg-white px-6">
      <div className="mx-auto flex max-w-7xl gap-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
