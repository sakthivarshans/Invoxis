import React from 'react';
import { LucideIcon, FileQuestion } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: LucideIcon;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon: Icon = FileQuestion,
  actionLabel,
  onAction,
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center bg-white rounded-lg border border-[#E3E8F0]">
      <div className="w-12 h-12 rounded-full bg-[#F2F6FF] flex items-center justify-center text-[#356AE6] mb-4">
        <Icon className="w-6 h-6" />
      </div>
      <h3 className="text-sm font-semibold text-[#172B4D]">{title}</h3>
      <p className="mt-1 text-xs text-[#697586] max-w-sm">{description}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-4 px-4 py-2 text-xs font-medium text-white bg-[#356AE6] hover:bg-[#2955BF] rounded-lg transition-colors"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};
