import { useSearchParams } from 'react-router-dom';

export interface TabDef {
  id: string;
  label: string;
}

interface TabsProps {
  tabs: TabDef[];
  paramName?: string;
  defaultTab?: string;
  onChange?: (id: string) => void;
}

export function Tabs({ tabs, paramName = 'tab', defaultTab, onChange }: TabsProps) {
  const [params, setParams] = useSearchParams();
  const active = params.get(paramName) ?? defaultTab ?? tabs[0]?.id ?? '';

  function select(id: string) {
    const next = new URLSearchParams(params);
    next.set(paramName, id);
    setParams(next, { replace: true });
    onChange?.(id);
  }

  return (
    <div className="flex border-b border-slate-200 overflow-x-auto no-scrollbar">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => select(tab.id)}
          className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
            active === tab.id
              ? 'border-[#0D3349] text-[#0D3349]'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function useActiveTab(paramName = 'tab', defaultTab = '') {
  const [params] = useSearchParams();
  return params.get(paramName) ?? defaultTab;
}
