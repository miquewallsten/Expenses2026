import { cn } from "@/lib/utils";

type BadgeVariant = "success" | "warning" | "error" | "neutral";

const variantClasses: Record<BadgeVariant, string> = {
  success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  warning: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  error: "bg-red-500/10 text-red-400 border-red-500/20",
  neutral: "bg-neutral-500/10 text-neutral-400 border-neutral-500/20",
};

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  children: React.ReactNode;
}

export function Badge({ variant = "neutral", className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none",
        variantClasses[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
