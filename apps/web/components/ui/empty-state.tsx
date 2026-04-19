import { cn } from "@/lib/utils";

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-700 bg-white/5 px-6 py-10 text-center",
        className
      )}
    >
      <p className="text-sm font-medium text-neutral-300">{title}</p>
      {description && (
        <p className="mt-1 text-xs text-neutral-500 max-w-xs">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
