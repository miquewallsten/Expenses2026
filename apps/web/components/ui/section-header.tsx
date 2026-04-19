import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function SectionHeader({ title, description, action, className }: SectionHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-4 mb-3", className)}>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-neutral-100 truncate">{title}</h2>
        {description && (
          <p className="text-xs text-neutral-500 mt-0.5">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
