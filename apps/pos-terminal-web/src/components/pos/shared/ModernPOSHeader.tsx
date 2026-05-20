/**
 * Modern POS Header Component
 */

import { Search } from "lucide-react";

type ModernPOSHeaderProps = {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  searchDisabled?: boolean;
};

export function ModernPOSHeader({
  searchQuery,
  onSearchChange,
  searchDisabled = false,
}: ModernPOSHeaderProps) {
  return (
    <div className="px-4 md:px-8 pb-3">
      <div className="relative">
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
    </div>
  );
}
