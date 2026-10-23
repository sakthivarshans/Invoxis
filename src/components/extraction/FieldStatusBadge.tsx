import React from 'react';
import { Check, AlertTriangle, AlertCircle, Edit3 } from 'lucide-react';

export type FieldStatusType = 'valid' | 'missing' | 'warning' | 'manual';

interface FieldStatusBadgeProps {
  status: FieldStatusType;
}

export const FieldStatusBadge: React.FC<FieldStatusBadgeProps> = ({ status }) => {
  switch (status) {
    case 'valid':
      return (
        <span
          className="inline-flex items-center text-[#16865C] p-0.5"
          title="Extracted with high confidence"
        >
          <Check className="w-3.5 h-3.5 stroke-[2.5]" />
        </span>
      );
    case 'missing':
      return (
        <span
          className="inline-flex items-center text-[#C98512] p-0.5"
          title="Missing required field"
        >
          <AlertTriangle className="w-3.5 h-3.5" />
        </span>
      );
    case 'warning':
      return (
        <span
          className="inline-flex items-center text-[#D64545] p-0.5"
          title="Discrepancy or anomaly flagged"
        >
          <AlertCircle className="w-3.5 h-3.5" />
        </span>
      );
    case 'manual':
      return (
        <span
          className="inline-flex items-center text-[#356AE6] p-0.5"
          title="Manually edited value"
        >
          <Edit3 className="w-3 h-3" />
        </span>
      );
  }
};
