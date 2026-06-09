type Props = {
  name: string;
  className?: string;
  textClassName?: string;
};

const COLORS = [
  "bg-blue-100 text-blue-600",
  "bg-emerald-100 text-emerald-600",
  "bg-orange-100 text-orange-600",
  "bg-violet-100 text-violet-600",
  "bg-rose-100 text-rose-600",
  "bg-amber-100 text-amber-600",
  "bg-cyan-100 text-cyan-600",
  "bg-pink-100 text-pink-600",
];

function pickColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length];
}

export function ProductAvatar({ name, className = "", textClassName = "text-lg font-bold" }: Props) {
  const initial = (name ?? "?").charAt(0).toUpperCase();
  const color = pickColor(name ?? "");
  return (
    <div className={`w-full h-full flex items-center justify-center ${color} ${className}`}>
      <span className={textClassName}>{initial}</span>
    </div>
  );
}
