"use client";

interface Props {
  companyId: number;
  onCompleted: () => void;
}

export default function AdminProfileInterview({ onCompleted }: Props) {
  return (
    <div className="p-4">
      <p className="text-[11px] text-white/60 mb-3">Company profile interview — configure your company details.</p>
      <button
        onClick={onCompleted}
        className="px-3 py-1.5 rounded border border-white/[0.07] bg-white/[0.02] text-[11px] text-white/55 hover:bg-white/[0.05]"
      >
        Mark as Complete
      </button>
    </div>
  );
}
