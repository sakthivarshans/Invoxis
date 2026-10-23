import React from 'react';
import { ProcessingStatus, ValidationStatus, ReviewStatus } from '../../types/invoice';

interface StatusBadgeProps {
  type: 'processing' | 'validation' | 'review';
  status: ProcessingStatus | ValidationStatus | ReviewStatus | string;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ type, status, size = 'sm' }) => {
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';

  if (type === 'processing') {
    switch (status) {
      case 'completed':
        return (
          <span className={`inline-flex items-center font-medium rounded-md bg-[#ECFDF3] text-[#16865C] border border-[#A6F4C5] ${sizeClasses}`}>
            Completed
          </span>
        );
      case 'processing':
        return (
          <span className={`inline-flex items-center font-medium rounded-md bg-[#EFF8FF] text-[#175CD3] border border-[#B2DDFF] ${sizeClasses}`}>
            Processing
          </span>
        );
      case 'queued':
        return (
          <span className={`inline-flex items-center font-medium rounded-md bg-[#F8F9FA] text-[#475467] border border-[#EAECF0] ${sizeClasses}`}>
            Queued
          </span>
        );
      case 'needs_review':
        return (
          <span className={`inline-flex items-center font-medium rounded-md bg-[#FFFAEB] text-[#B54708] border border-[#FEDF89] ${sizeClasses}`}>
            Needs Review
          </span>
        );
      case 'failed':
        return (
          <span className={`inline-flex items-center font-medium rounded-md bg-[#FEF3F2] text-[#D64545] border border-[#FECDCA] ${sizeClasses}`}>
            Failed
          </span>
        );
      default:
        return <span className={`inline-flex items-center text-xs text-slate-600 ${sizeClasses}`}>{status}</span>;
    }
  }

  if (type === 'validation') {
    switch (status) {
      case 'valid':
        return (
          <span className={`inline-flex items-center font-medium rounded-md bg-[#ECFDF3] text-[#16865C] border border-[#A6F4C5] ${sizeClasses}`}>
            Valid
          </span>
        );
      case 'warning':
        return (
          <span className={`inline-flex items-center font-medium rounded-md bg-[#FFFAEB] text-[#B54708] border border-[#FEDF89] ${sizeClasses}`}>
            Warning
          </span>
        );
      case 'critical':
        return (
          <span className={`inline-flex items-center font-medium rounded-md bg-[#FEF3F2] text-[#D64545] border border-[#FECDCA] ${sizeClasses}`}>
            Discrepancy
          </span>
        );
      case 'unvalidated':
      default:
        return (
          <span className={`inline-flex items-center font-medium rounded-md bg-[#F8F9FA] text-[#697586] border border-[#EAECF0] ${sizeClasses}`}>
            Unvalidated
          </span>
        );
    }
  }

  if (type === 'review') {
    switch (status) {
      case 'approved':
        return (
          <span className={`inline-flex items-center font-medium rounded-md bg-[#ECFDF3] text-[#16865C] border border-[#A6F4C5] ${sizeClasses}`}>
            Approved
          </span>
        );
      case 'in_review':
        return (
          <span className={`inline-flex items-center font-medium rounded-md bg-[#EFF8FF] text-[#175CD3] border border-[#B2DDFF] ${sizeClasses}`}>
            In Review
          </span>
        );
      case 'pending':
        return (
          <span className={`inline-flex items-center font-medium rounded-md bg-[#FFFAEB] text-[#B54708] border border-[#FEDF89] ${sizeClasses}`}>
            Pending Review
          </span>
        );
      case 'returned_for_correction':
        return (
          <span className={`inline-flex items-center font-medium rounded-md bg-[#FEF6EE] text-[#C4320A] border border-[#F9DBAF] ${sizeClasses}`}>
            Returned
          </span>
        );
      case 'rejected':
        return (
          <span className={`inline-flex items-center font-medium rounded-md bg-[#FEF3F2] text-[#D64545] border border-[#FECDCA] ${sizeClasses}`}>
            Rejected
          </span>
        );
      default:
        return <span className={`inline-flex items-center text-xs text-slate-600 ${sizeClasses}`}>{status}</span>;
    }
  }

  return <span className={`inline-flex items-center text-xs text-slate-600 ${sizeClasses}`}>{status}</span>;
};
