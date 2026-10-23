/**
 * Date formatting and parsing utilities
 */

export function formatDate(dateString: string | undefined | null, format: string = 'YYYY-MM-DD'): string {
  if (!dateString) return '—';
  
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString; // return raw if not parseable

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');

    if (format === 'DD/MM/YYYY') {
      return `${day}/${month}/${year}`;
    } else if (format === 'MM/DD/YYYY') {
      return `${month}/${day}/${year}`;
    } else if (format === 'MMM DD, YYYY') {
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${monthNames[d.getMonth()]} ${day}, ${year}`;
    }

    return `${year}-${month}-${day}`;
  } catch {
    return dateString;
  }
}

export function formatDateTime(isoString: string | undefined | null): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return isoString;
  }
}

export function isValidDate(dateStr: string): boolean {
  if (!dateStr || dateStr.trim() === '') return false;
  const d = new Date(dateStr);
  return !isNaN(d.getTime());
}
