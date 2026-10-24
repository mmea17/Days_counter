export interface DateBreakdown {
  isPast: boolean;
  years: number;
  months: number;
  weeks: number;
  days: number;
  totalDays: number;
  totalWeeks: number;
  workingDays: number;
}

export type WeekendMode = 'friday_saturday' | 'saturday_sunday';

/**
 * Calculates calendar difference strictly in days, weeks, months, and years (no hours, minutes, or seconds)
 */
export function calculateDateDifference(
  startDateInput: Date | string | number,
  endDateInput: Date | string | number,
  weekendMode: WeekendMode = 'friday_saturday'
): DateBreakdown {
  const d1 = new Date(startDateInput);
  const d2 = new Date(endDateInput);

  // Normalize both dates to midnight (00:00:00) so we only work with full calendar days
  const startMidnight = new Date(d1.getFullYear(), d1.getMonth(), d1.getDate());
  const endMidnight = new Date(d2.getFullYear(), d2.getMonth(), d2.getDate());

  const startMs = startMidnight.getTime();
  const endMs = endMidnight.getTime();
  const isPast = endMs < startMs;

  const earlier = isPast ? endMidnight : startMidnight;
  const later = isPast ? startMidnight : endMidnight;

  const msPerDay = 1000 * 60 * 60 * 24;
  const totalDays = Math.round((later.getTime() - earlier.getTime()) / msPerDay);
  const totalWeeks = Number((totalDays / 7).toFixed(1));

  // Calendar breakdown (Years, Months, Days)
  let y = later.getFullYear() - earlier.getFullYear();
  let m = later.getMonth() - earlier.getMonth();
  let d = later.getDate() - earlier.getDate();

  if (d < 0) {
    const prevMonthDate = new Date(later.getFullYear(), later.getMonth(), 0);
    d += prevMonthDate.getDate();
    m--;
  }
  if (m < 0) {
    m += 12;
    y--;
  }

  const weeks = Math.floor(d / 7);
  const remainingDays = d % 7;

  // Calculate working days
  let workingDays = 0;
  const cur = new Date(earlier);

  while (cur < later) {
    const dayOfWeek = cur.getDay(); // 0 = Sunday, 1 = Monday, ... 5 = Friday, 6 = Saturday
    let isWeekend = false;

    if (weekendMode === 'friday_saturday') {
      isWeekend = dayOfWeek === 5 || dayOfWeek === 6; // Friday & Saturday
    } else {
      isWeekend = dayOfWeek === 0 || dayOfWeek === 6; // Sunday & Saturday
    }

    if (!isWeekend) {
      workingDays++;
    }
    cur.setDate(cur.getDate() + 1);
  }

  return {
    isPast,
    years: Math.max(0, y),
    months: Math.max(0, m),
    weeks: Math.max(0, weeks),
    days: Math.max(0, remainingDays),
    totalDays,
    totalWeeks,
    workingDays,
  };
}

/**
 * Format relative text for events in Arabic (Days, Weeks, Months, Years only)
 */
export function formatArabicDuration(
  targetDateInput: Date | string,
  mode: 'days' | 'weeks_days' | 'months_days' | 'years_months_days' = 'days',
  referenceDateInput: Date | string = new Date()
): { formatted: string; isPast: boolean } {
  const target = new Date(targetDateInput);
  const now = new Date(referenceDateInput);
  const diff = calculateDateDifference(now, target);

  const directionPrefix = diff.isPast ? 'مضى منذ' : 'متبقي';

  let formatted = '';

  switch (mode) {
    case 'days':
      formatted = `${diff.totalDays} يوم`;
      break;

    case 'weeks_days': {
      const weeks = Math.floor(diff.totalDays / 7);
      const days = diff.totalDays % 7;
      if (weeks === 0) {
        formatted = `${days} يوم`;
      } else if (days === 0) {
        formatted = `${weeks} أسبوع`;
      } else {
        formatted = `${weeks} أسبوع و ${days} يوم`;
      }
      break;
    }

    case 'months_days': {
      const months = diff.years * 12 + diff.months;
      const days = diff.weeks * 7 + diff.days;
      if (months === 0) {
        formatted = `${days} يوم`;
      } else if (days === 0) {
        formatted = `${months} شهر`;
      } else {
        formatted = `${months} شهر و ${days} يوم`;
      }
      break;
    }

    case 'years_months_days':
    default: {
      const parts: string[] = [];
      if (diff.years > 0) parts.push(`${diff.years} سنة`);
      if (diff.months > 0) parts.push(`${diff.months} شهر`);
      const days = diff.weeks * 7 + diff.days;
      if (days > 0 || parts.length === 0) parts.push(`${days} يوم`);
      formatted = parts.join(' و ');
      break;
    }
  }

  return {
    formatted: `${directionPrefix} ${formatted}`,
    isPast: diff.isPast,
  };
}
