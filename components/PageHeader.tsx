'use client';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

export function PageHeader({ title, subtitle, back, children, right }: { title?: React.ReactNode; subtitle?: React.ReactNode; back?: boolean; children?: React.ReactNode; right?: React.ReactNode }) {
  const router = useRouter();
  return (
    <div className="sticky top-0 z-20 border-b border-border bg-bg/75 backdrop-blur-md">
      {(title || back) && (
        <div className="flex h-[53px] items-center gap-6 px-4">
          {back && (
            <button onClick={() => (window.history.length > 1 ? router.back() : router.push('/'))} className="-ml-2 rounded-full p-2 hover:bg-text/10" aria-label="Back">
              <ArrowLeft size={20} />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[20px] font-bold leading-6">{title}</h1>
            {subtitle && <div className="truncate text-meta text-muted">{subtitle}</div>}
          </div>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="flex overflow-x-auto" role="tablist" style={{ scrollbarWidth: 'none' }}>
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className="flex h-[53px] min-w-[72px] flex-1 justify-center px-3 transition-colors hover:bg-text/10"
        >
          <span className={`relative flex items-center whitespace-nowrap text-[15px] ${value === t.id ? 'font-bold text-text' : 'font-medium text-muted'}`}>
            {t.label}
            {value === t.id && <span className="absolute inset-x-0 bottom-0 h-1 rounded-full bg-accent" />}
          </span>
        </button>
      ))}
    </div>
  );
}
