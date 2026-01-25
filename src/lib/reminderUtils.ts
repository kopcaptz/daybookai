/**
 * Utility functions for reminder time calculations.
 * MVP: Smart defaults for time chip presets.
 */

import { format, addDays, setHours, setMinutes, nextSaturday, nextMonday, isAfter, startOfDay, endOfDay } from 'date-fns';
import type { SuggestedTime } from './reminderDetection';

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
 * Get timestamp for "Later today" - 18:00 or +3h if after 15:00.
 */
function getLaterTodayTimestamp(): number {
  const now = new Date();
  const hours = now.getHours();
  
  if (hours >= 15) {
    // After 15:00, add 3 hours
    return now.getTime() + 3 * 60 * 60 * 1000;
  }
  
  // Default to 18:00 today
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
 */
export function formatDueDate(dueAt: number, language: 'ru' | 'en'): string {
  const date = new Date(dueAt);
  const now = new Date();
  
  if (isOverdue(dueAt)) {
    return language === 'ru' ? 'Просрочено' : 'Overdue';
  }
  
  if (isDueToday(dueAt)) {
    const timeStr = format(date, 'HH:mm');
    return language === 'ru' ? `Сегодня, ${timeStr}` : `Today, ${timeStr}`;
  }
  
  // Tomorrow
  const tomorrow = addDays(startOfDay(now), 1);
  if (date >= tomorrow && date < addDays(tomorrow, 1)) {
    const timeStr = format(date, 'HH:mm');
    return language === 'ru' ? `Завтра, ${timeStr}` : `Tomorrow, ${timeStr}`;
  }
  
  // Further out
  const dateStr = format(date, language === 'ru' ? 'd MMM, HH:mm' : 'MMM d, HH:mm');
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
