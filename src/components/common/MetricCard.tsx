import React from 'react';
import { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  label: string;
  value: string | number;
  caption?: string;
  icon: LucideIcon;
  trend?: {
    value: string;
    isPositive: boolean;
  };
  variant?: 'default' | 'warning' | 'danger' | 'success' | 'blue';
  onClick?: () => void;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  caption,
  icon: Icon,
  trend,
  variant = 'default',
  onClick,
}) => {
  const iconVariantClasses = {
    default: 'text-[#172B4D] bg-[#F2F6FF]',
    blue: 'text-[#356AE6] bg-[#EFF8FF]',
    warning: 'text-[#C98512] bg-[#FFFAEB]',
    danger: 'text-[#D64545] bg-[#FEF3F2]',
    success: 'text-[#16865C] bg-[#ECFDF3]',
  }[variant];

  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-lg border border-[#E3E8F0] p-4 flex flex-col justify-between transition-all ${
        onClick ? 'cursor-pointer hover:border-[#356AE6]/50 hover:shadow-xs' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs font-medium text-[#697586] tracking-tight">{label}</span>
        <div className={`p-2 rounded-md ${iconVariantClasses}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>

      <div className="mt-3">
        <div className="text-2xl font-bold tracking-tight text-[#172B4D] tabular-nums font-mono">
          {value}
        </div>

        <div className="mt-1 flex items-center justify-between text-xs text-[#697586]">
          {caption && <span className="truncate">{caption}</span>}
          {trend && (
            <span
              className={`font-medium tabular-nums ml-auto ${
                trend.isPositive ? 'text-[#16865C]' : 'text-[#D64545]'
              }`}
            >
              {trend.value}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
