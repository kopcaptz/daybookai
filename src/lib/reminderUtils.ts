/**
 * Utility functions for reminder time calculations.
 * MVP: Smart defaults for time chip presets and snooze options.
 */

import { format, addDays, addHours, addMonths, setHours, setMinutes, nextSaturday, nextMonday, startOfDay, endOfDay, getDate, getDaysInMonth, setDate } from 'date-fns';
import type { SuggestedTime } from './reminderDetection';
import type { ReminderRepeat } from './db';

/**
 * Time chip preset configuration.
 */
export interface TimeChip {
  id: SuggestedTime;
  labelRu: string;
  labelEn: string;
  getTimestamp: () => number;
}

/**
 * Snooze preset configuration.
 */
export interface SnoozePreset {
  id: string;
  labelRu: string;
  labelEn: string;
  getTimestamp: () => number;
}

// ============================================
// INTERNAL TIMESTAMP GENERATORS
// ============================================

/**
 * Get timestamp for "Later today" - 18:00 or +3h if after 15:00.
 */
function getLaterTodayTimestamp(): number {
  const now = new Date();
  const hours = now.getHours();
  
  if (hours >= 15) {
    return addHours(now, 3).getTime();
  }
  
  return setMinutes(setHours(now, 18), 0).getTime();
}

/**
 * Get timestamp for "Tomorrow morning" - 09:00 tomorrow.
 */
function getTomorrowMorningTimestamp(): number {
  const tomorrow = addDays(new Date(), 1);
  return setMinutes(setHours(tomorrow, 9), 0).getTime();
}

/**
 * Get timestamp for "Weekend" - Saturday 10:00.
 */
function getWeekendTimestamp(): number {
  const now = new Date();
  const saturday = nextSaturday(now);
  return setMinutes(setHours(saturday, 10), 0).getTime();
}

/**
 * Get timestamp for "Next week" - Monday 09:00.
 */
function getNextWeekTimestamp(): number {
  const now = new Date();
  const monday = nextMonday(now);
  return setMinutes(setHours(monday, 9), 0).getTime();
}

/**
 * Get timestamp for "1 hour from now".
 */
function getOneHourTimestamp(): number {
  return addHours(new Date(), 1).getTime();
}

// ============================================
// TIME CHIP PRESETS (for creating reminders)
// ============================================

/**
 * All available time chip presets.
 */
export const TIME_CHIPS: TimeChip[] = [
  {
    id: 'later_today',
    labelRu: 'Сегодня позже',
    labelEn: 'Later today',
    getTimestamp: getLaterTodayTimestamp,
  },
  {
    id: 'tomorrow_morning',
    labelRu: 'Завтра утром',
    labelEn: 'Tomorrow morning',
    getTimestamp: getTomorrowMorningTimestamp,
  },
  {
    id: 'weekend',
    labelRu: 'В выходные',
    labelEn: 'Weekend',
    getTimestamp: getWeekendTimestamp,
  },
  {
    id: 'next_week',
    labelRu: 'На неделе',
    labelEn: 'Next week',
    getTimestamp: getNextWeekTimestamp,
  },
];

/**
 * Get time chip by ID.
 */
export function getTimeChip(id: SuggestedTime): TimeChip | undefined {
  return TIME_CHIPS.find(chip => chip.id === id);
}

/**
 * Get timestamp for a suggested time preset.
 */
export function getTimestampForPreset(preset: SuggestedTime): number {
  const chip = getTimeChip(preset);
  return chip ? chip.getTimestamp() : getTomorrowMorningTimestamp();
}

// ============================================
// SNOOZE PRESETS (for postponing reminders)
// ============================================

/**
 * Available snooze presets.
 */
export const SNOOZE_PRESETS: SnoozePreset[] = [
  {
    id: '1h',
    labelRu: 'Через 1 час',
    labelEn: 'In 1 hour',
    getTimestamp: getOneHourTimestamp,
  },
  {
    id: 'later_today',
    labelRu: 'Позже сегодня',
    labelEn: 'Later today',
    getTimestamp: getLaterTodayTimestamp,
  },
  {
    id: 'tomorrow_9am',
    labelRu: 'Завтра в 9:00',
    labelEn: 'Tomorrow 9am',
    getTimestamp: getTomorrowMorningTimestamp,
  },
];

/**
 * Get snooze timestamp by preset ID.
 */
export function getSnoozeTimestamp(presetId: string): number {
  const preset = SNOOZE_PRESETS.find(p => p.id === presetId);
  return preset ? preset.getTimestamp() : getOneHourTimestamp();
}

// ============================================
// DATE/TIME HELPERS
// ============================================

/**
 * Check if a reminder is overdue (due before start of today).
 */
export function isOverdue(dueAt: number): boolean {
  const todayStart = startOfDay(new Date()).getTime();
  return dueAt < todayStart;
}

/**
 * Check if a reminder is due today (between start and end of today).
 */
export function isDueToday(dueAt: number): boolean {
  const now = new Date();
  const todayStart = startOfDay(now).getTime();
  const todayEnd = endOfDay(now).getTime();
  return dueAt >= todayStart && dueAt <= todayEnd;
}

/**
 * Format due date for display.
 * Accepts Language type from i18n, falls back to 'en' for non-ru languages
 */
export function formatDueDate(dueAt: number, language: string): string {
  const date = new Date(dueAt);
  const now = new Date();
  const baseLang = language === 'ru' ? 'ru' : 'en';
  
  if (isOverdue(dueAt)) {
    return baseLang === 'ru' ? 'Просрочено' : 'Overdue';
  }
  
  if (isDueToday(dueAt)) {
    const timeStr = format(date, 'HH:mm');
    return baseLang === 'ru' ? `Сегодня, ${timeStr}` : `Today, ${timeStr}`;
  }
  
  // Tomorrow
  const tomorrow = addDays(startOfDay(now), 1);
  if (date >= tomorrow && date < addDays(tomorrow, 1)) {
    const timeStr = format(date, 'HH:mm');
    return baseLang === 'ru' ? `Завтра, ${timeStr}` : `Tomorrow, ${timeStr}`;
  }
  
  // Further out
  const dateStr = format(date, baseLang === 'ru' ? 'd MMM, HH:mm' : 'MMM d, HH:mm');
  return dateStr;
}

/**
 * Get end of today timestamp (for querying today's reminders).
 */
export function getEndOfTodayTimestamp(): number {
  return endOfDay(new Date()).getTime();
}

/**
 * Get start of today timestamp.
 */
export function getStartOfTodayTimestamp(): number {
  return startOfDay(new Date()).getTime();
}

/**
 * Get timestamp 24 hours from now.
 */
export function getNowPlus24hTimestamp(): number {
  return Date.now() + 24 * 60 * 60 * 1000;
}

// ============================================
// RECURRING REMINDER HELPERS
// ============================================

/**
 * Compute next due date for a repeating reminder.
 * - daily: +1 day at same local time
 * - weekly: +7 days at same local time
 * - monthly: same day-of-month next month (clamped to last day if needed)
 */
export function computeNextDueAt(currentDueAt: number, repeat: ReminderRepeat): number | null {
  if (!repeat || repeat === 'none') return null;
  
  const current = new Date(currentDueAt);
  const hours = current.getHours();
  const minutes = current.getMinutes();
  
  switch (repeat) {
    case 'daily': {
      const next = addDays(current, 1);
      return setMinutes(setHours(next, hours), minutes).getTime();
    }
    case 'weekly': {
      const next = addDays(current, 7);
      return setMinutes(setHours(next, hours), minutes).getTime();
    }
    case 'monthly': {
      const dayOfMonth = getDate(current);
      const nextMonth = addMonths(current, 1);
      const daysInNextMonth = getDaysInMonth(nextMonth);
      // Clamp day to last day of month if needed
      const clampedDay = Math.min(dayOfMonth, daysInNextMonth);
      const next = setDate(nextMonth, clampedDay);
      return setMinutes(setHours(next, hours), minutes).getTime();
    }
    default:
      return null;
  }
}

/**
 * Repeat option labels for UI.
 */
export const REPEAT_OPTIONS: { value: ReminderRepeat; labelRu: string; labelEn: string }[] = [
  { value: 'none', labelRu: 'Не повторять', labelEn: 'No repeat' },
  { value: 'daily', labelRu: 'Ежедневно', labelEn: 'Daily' },
  { value: 'weekly', labelRu: 'Еженедельно', labelEn: 'Weekly' },
  { value: 'monthly', labelRu: 'Ежемесячно', labelEn: 'Monthly' },
];
