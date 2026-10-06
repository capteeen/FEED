'use client';
import { useEffect } from 'react';
import { X } from 'lucide-react';

export function Modal({ open, onClose, children, title, wide, right }: { open: boolean; onClose: () => void; children: React.ReactNode; title?: React.ReactNode; wide?: boolean; right?: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', k);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-[rgb(var(--overlay)/0.4)] sm:pt-[5vh]" onMouseDown={onClose} role="dialog" aria-modal>
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className={`flex h-full w-full flex-col overflow-hidden bg-bg sm:h-auto sm:max-h-[90vh] sm:rounded-card ${wide ? 'sm:max-w-[640px]' : 'sm:max-w-[600px]'}`}
      >
        <div className="flex h-[53px] shrink-0 items-center gap-4 px-4">
          <button onClick={onClose} className="-ml-2 rounded-full p-2 hover:bg-text/10" aria-label="Close">
            <X size={20} />
          </button>
          <div className="flex-1 text-[20px] font-bold">{title}</div>
          {right}
        </div>
        <div className="overflow-y-auto scroll-thin">{children}</div>
      </div>
    </div>
  );
}
