import { Search, Clock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

type ModernPOSHeaderProps = {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  searchDisabled?: boolean;
  isLoading?: boolean;
  onDraftClick?: () => void;
  draftCount?: number;
};

export function ModernPOSHeader({
  searchQuery,
  onSearchChange,
  searchDisabled = false,
  isLoading = false,
  onDraftClick,
  draftCount = 0,
}: ModernPOSHeaderProps) {
  if (isLoading) {
    return (
      <div className="px-4 md:px-8 pb-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 flex-1 rounded-xl" />
          <Skeleton className="h-9 w-20 rounded-xl flex-shrink-0" />
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 md:px-8 pb-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Cari menu..."
            className="w-full bg-white border border-slate-200 pl-9 pr-4 py-2 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 disabled:opacity-50 disabled:cursor-not-allowed"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            disabled={searchDisabled}
            data-testid="input-search-products"
          />
        </div>

        {onDraftClick && (
          <button
            onClick={onDraftClick}
            className="relative flex-shrink-0 flex items-center gap-1.5 bg-white border border-slate-200 hover:border-amber-300 hover:bg-amber-50 px-3 h-9 rounded-xl text-xs font-semibold text-slate-600 hover:text-amber-700 transition-colors shadow-sm whitespace-nowrap"
            data-testid="btn-open-draft-sheet"
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Draft</span>
            {draftCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-amber-500 text-white text-[10px] font-bold rounded-full leading-none">
                {draftCount}
              </span>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
