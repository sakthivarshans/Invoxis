/**
 * Utility functions for formatting and parsing currency and amounts
 */

export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  CAD: 'CA$',
  JPY: '¥',
  CHF: 'CHF',
  AUD: 'AU$',
};

export function formatCurrency(amount: number | undefined | null, currency: string = 'USD'): string {
  if (amount === undefined || amount === null || isNaN(amount)) {
    return '—';
  }
  
  const symbol = CURRENCY_SYMBOLS[currency] || `${currency} `;
  
  return `${symbol}${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatNumber(value: number | undefined | null): string {
  if (value === undefined || value === null || isNaN(value)) {
    return '0';
  }
  return value.toLocaleString('en-US');
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
