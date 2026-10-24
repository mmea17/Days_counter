export interface DateBreakdown {
  isPast: boolean;
  years: number;
  months: number;
  weeks: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalDays: number;
  totalWeeks: number;
  totalHours: number;
  totalMinutes: number;
  totalSeconds: number;
  workingDays: number;
}

export type WeekendMode = 'friday_saturday' | 'saturday_sunday';

/**
 * Calculates accurate calendar difference between two dates
 */
export function calculateDateDifference(
  startDateInput: Date | string | number,
  endDateInput: Date | string | number,
  weekendMode: WeekendMode = 'friday_saturday'
): DateBreakdown {
  const d1 = new Date(startDateInput);
  const d2 = new Date(endDateInput);

  const startMs = d1.getTime();
  const endMs = d2.getTime();
  const isPast = endMs < startMs;

  const earlier = isPast ? d2 : d1;
  const later = isPast ? d1 : d2;

  const totalMs = later.getTime() - earlier.getTime();
  const totalSeconds = Math.floor(totalMs / 1000);
  const totalMinutes = Math.floor(totalSeconds / 60);
  const totalHours = Math.floor(totalMinutes / 60);
  const totalDays = Math.floor(totalHours / 24);
  const totalWeeks = Number((totalDays / 7).toFixed(1));

  // Calendar breakdown (Years, Months, Days)
  let y = later.getFullYear() - earlier.getFullYear();
  let m = later.getMonth() - earlier.getMonth();
  let d = later.getDate() - earlier.getDate();
  let h = later.getHours() - earlier.getHours();
  let min = later.getMinutes() - earlier.getMinutes();
  let s = later.getSeconds() - earlier.getSeconds();

  if (s < 0) {
    s += 60;
    min--;
  }
  if (min < 0) {
    min += 60;
    h--;
  }
  if (h < 0) {
    h += 24;
    d--;
  }
  if (d < 0) {
    // Borrow days from previous month
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
  cur.setHours(0, 0, 0, 0);
  const endCompare = new Date(later);
  endCompare.setHours(0, 0, 0, 0);

  while (cur < endCompare) {
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
    hours: Math.max(0, h),
    minutes: Math.max(0, min),
    seconds: Math.max(0, s),
    totalDays,
    totalWeeks,
    totalHours,
    totalMinutes,
    totalSeconds,
    workingDays,
  };
}

/**
 * Format relative text for events in Arabic
 */
export function formatArabicDuration(
  targetDateInput: Date | string,
  mode: 'days' | 'weeks_days' | 'months_days' | 'years_months_days' = 'days',
  referenceDateInput: Date | string = new Date()
): { formatted: string; isPast: boolean; subtext: string } {
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

  const subtext = `${diff.hours} ساعة، ${diff.minutes} دقيقة`;

  return {
    formatted: `${directionPrefix} ${formatted}`,
    isPast: diff.isPast,
    subtext,
  };
}
