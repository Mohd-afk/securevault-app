import type { SortOption } from '../hooks/useSort';

interface SortModalProps {
  open: boolean;
  onClose: () => void;
  value: SortOption;
  onChange: (option: SortOption) => void;
}

const OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'title-asc', label: 'Title ↑' },
  { value: 'title-desc', label: 'Title ↓' },
  { value: 'modified-new', label: 'Modified ↑' },
  { value: 'modified-old', label: 'Modified ↓' },
  { value: 'created-new', label: 'Created ↑' },
  { value: 'created-old', label: 'Created ↓' },
  { value: 'size-asc', label: 'Size ↑' },
];

export function SortModal({ open, onClose, value, onChange }: SortModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Sheet */}
      <div
        className="relative w-full max-w-md bg-[#1e2533] rounded-t-3xl px-4 pt-5 pb-[max(env(safe-area-inset-bottom),_20px)] shadow-2xl animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-white text-xl font-semibold mb-5 px-2">Sorting</h3>

        <div className="space-y-1 mb-6">
          {OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                onChange(opt.value);
                onClose();
              }}
              className="w-full flex items-center gap-4 px-3 py-3.5 rounded-xl hover:bg-white/5 active:bg-white/10 transition-colors"
            >
              {/* Radio circle */}
              <div
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                  value === opt.value
                    ? 'border-[#f5a623] bg-[#f5a623]'
                    : 'border-gray-500'
                }`}
              >
                {value === opt.value && (
                  <div className="w-2 h-2 rounded-full bg-white" />
                )}
              </div>
              <span className="text-white text-base">{opt.label}</span>
            </button>
          ))}
        </div>

        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="text-[#f5a623] font-medium text-base px-4 py-2"
          >
            Cancel
          </button>
        </div>
      </div>

      <style>{`
        @keyframes slide-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .animate-slide-up {
          animation: slide-up 0.25s cubic-bezier(0.32, 0.72, 0, 1);
        }
      `}</style>
    </div>
  );
}
