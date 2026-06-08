const ORDER_NUMBER_PREFIX = 'ORD';
const DEFAULT_TIMEZONE = 'UTC';

export function getBusinessDateForTimezone(date: Date, timezone: string | null | undefined): string {
  const safeTimezone = timezone || DEFAULT_TIMEZONE;

  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: safeTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = formatter.formatToParts(date);
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;

    if (!year || !month || !day) {
      throw new Error(`Unable to format business date for timezone ${safeTimezone}`);
    }

    return `${year}-${month}-${day}`;
  } catch (error) {
    if (safeTimezone === DEFAULT_TIMEZONE) throw error;
    return getBusinessDateForTimezone(date, DEFAULT_TIMEZONE);
  }
}

export function formatOrderNumberForSequence(businessDate: string, sequence: number): string {
  if (!Number.isFinite(sequence) || sequence < 1) {
    throw new Error('Failed to allocate order number sequence');
  }

  return `${ORDER_NUMBER_PREFIX}-${businessDate.replace(/-/g, '')}-${sequence.toString().padStart(4, '0')}`;
}
