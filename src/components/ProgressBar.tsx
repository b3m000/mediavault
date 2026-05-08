import { formatPercentage } from "../utils/content";

interface ProgressBarProps {
  value: number;
  tone?: "brand" | "success" | "warning";
  compact?: boolean;
}

export function ProgressBar({ value, tone = "brand", compact = false }: ProgressBarProps) {
  const width = Math.max(0, Math.min(100, value));
  const barHeightClass = compact ? "h-1.5" : "h-2.5";

  const toneGradient =
    tone === "success"
      ? "linear-gradient(90deg, #30a87f, #1f7b5d)"
      : tone === "warning"
        ? "linear-gradient(90deg, #f0be58, #c4891f)"
        : "linear-gradient(90deg, #5f95ff, #3d72de)";

  return (
    <div className="w-full">
      <div className={`${barHeightClass} w-full overflow-hidden rounded-full bg-[#162a4b]`} aria-label={`Progresso ${formatPercentage(width)}`}>
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${width}%`, backgroundImage: toneGradient }} />
      </div>
      {!compact ? <p className="mt-1 text-xs font-semibold text-[var(--muted)]">{formatPercentage(width)}</p> : null}
    </div>
  );
}
