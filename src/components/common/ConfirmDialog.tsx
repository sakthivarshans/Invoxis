import React from 'react';
import { AlertCircle, CheckCircle2, AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'primary' | 'success';
  onConfirm: () => void;
  onCancel: () => void;
  children?: React.ReactNode;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'primary',
  onConfirm,
  onCancel,
  children,
}) => {
  if (!isOpen) return null;

  const btnClasses = {
    primary: 'bg-[#356AE6] hover:bg-[#2955BF] text-white',
    danger: 'bg-[#D64545] hover:bg-[#B42318] text-white',
    warning: 'bg-[#C98512] hover:bg-[#B54708] text-white',
    success: 'bg-[#16865C] hover:bg-[#0E6243] text-white',
  }[variant];

  const IconComp = {
    primary: AlertCircle,
    danger: AlertCircle,
    warning: AlertTriangle,
    success: CheckCircle2,
  }[variant];

  const iconColors = {
    primary: 'text-[#356AE6] bg-[#EFF8FF]',
    danger: 'text-[#D64545] bg-[#FEF3F2]',
    warning: 'text-[#C98512] bg-[#FFFAEB]',
    success: 'text-[#16865C] bg-[#ECFDF3]',
  }[variant];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
      <div className="relative w-full max-w-lg bg-white rounded-xl shadow-xl border border-[#E3E8F0] p-6 animate-in fade-in zoom-in-95 duration-150">
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 text-[#697586] hover:text-[#172B4D] p-1 rounded-md"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-start gap-4">
          <div className={`p-2.5 rounded-lg shrink-0 ${iconColors}`}>
            <IconComp className="w-5 h-5" />
          </div>

          <div className="flex-1">
            <h3 className="text-base font-semibold text-[#172B4D]">{title}</h3>
            <p className="mt-1 text-sm text-[#697586] leading-relaxed">{description}</p>
            {children && <div className="mt-4">{children}</div>}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-[#E3E8F0]">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-xs font-medium text-[#172B4D] bg-white border border-[#E3E8F0] rounded-lg hover:bg-[#F7F9FC] transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 text-xs font-medium rounded-lg transition-colors ${btnClasses}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
