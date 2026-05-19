"use client";

interface Props {
  companyId: number;
  onCompleted: () => void;
}

export default function AdminProfileInterview({ onCompleted }: Props) {
  return (
    <div className="p-4">
      <p className="text-[11px] text-secondary mb-3">Company profile interview - configure your company details.</p>
      <button
        onClick={onCompleted}
        className="px-3 py-1.5 rounded border border-default bg-surface-1 text-[11px] text-tertiary hover:bg-surface-2"
      >
        Mark as Complete
      </button>
    </div>
  );
}
