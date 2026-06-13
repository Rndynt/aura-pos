/**
 * Category Filter Chip Component
 * Used for product category filtering
 */

import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type CategoryChipProps = {
  id: string;
  name: string;
  icon?: LucideIcon;
  isActive: boolean;
  onClick: () => void;
};

export function CategoryChip({
  id,
  name,
  icon: Icon,
  isActive,
  onClick,
}: CategoryChipProps) {
  // Normalize id for data-testid (replace spaces with hyphens, lowercase)
  const testId = `category-chip-${id.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all duration-150",
        isActive
          ? "bg-blue-600 text-white shadow-md shadow-blue-200/60 scale-[1.03]"
          : "bg-white text-slate-500 border border-slate-200 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50/60"
      )}
      data-testid={testId}
    >
      {Icon && (
        <Icon
          size={15}
          className={isActive ? "text-white/90" : "text-slate-400 group-hover:text-blue-500"}
        />
      )}
      {name}
    </button>
  );
}
