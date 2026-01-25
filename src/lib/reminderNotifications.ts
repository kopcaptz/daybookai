/**
 * Android-only local notifications for Gentle Nudges reminders.
 * Schedules notifications for TODAY + OVERDUE pending reminders only.
 * Deep-links to /reminder/:id on tap.
 */

import { getPendingTodayAndOverdueReminders, type Reminder } from './db';
import { formatDueDate } from './reminderUtils';
import { isCapacitorNative, canShowNativeNotifications } from './notifications';

// ============================================
// SETTINGS STORAGE
// ============================================

const REMINDER_SETTINGS_KEY = 'daybook-reminder-notifications';

export interface ReminderNotificationSettings {
  enabled: boolean;
}

const DEFAULT_SETTINGS: ReminderNotificationSettings = {
  enabled: false,
};

export function loadReminderNotificationSettings(): ReminderNotificationSettings {
  try {
    const saved = localStorage.getItem(REMINDER_SETTINGS_KEY);
    if (saved) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
    }
  } catch {
    // ignore
  }
  return DEFAULT_SETTINGS;
}

export function saveReminderNotificationSettings(settings: Partial<ReminderNotificationSettings>): void {
  const current = loadReminderNotificationSettings();
  localStorage.setItem(REMINDER_SETTINGS_KEY, JSON.stringify({ ...current, ...settings }));
}

// ============================================
// NOTIFICATION ID STRATEGY
// ============================================

// Reminder notifications use ID range 100000 + reminder.id
// Avoids collision with biography notification (999999)
const REMINDER_NOTIFICATION_ID_OFFSET = 100000;

function getReminderNotificationId(reminderId: number): number {
  return REMINDER_NOTIFICATION_ID_OFFSET + reminderId;
}

function isReminderNotificationId(notificationId: number): boolean {
  return notificationId >= REMINDER_NOTIFICATION_ID_OFFSET && notificationId < 200000;
}

function extractReminderId(notificationId: number): number {
  return notificationId - REMINDER_NOTIFICATION_ID_OFFSET;
}

// ============================================
// RECONCILIATION LOGIC
// ============================================

/**
 * Reconcile scheduled notifications with DB state.
 * - Cancel notifications for reminders no longer pending
 * - Schedule new notifications for pending TODAY+OVERDUE reminders
 * - Respects snoozedUntil: only schedule if snoozedUntil == null || snoozedUntil <= now
 */
export async function reconcileReminderNotifications(language: 'ru' | 'en'): Promise<void> {
  // Skip if not Capacitor native
  if (!isCapacitorNative()) {
    return;
  }
  
  // Skip if disabled in settings
  const settings = loadReminderNotificationSettings();
  if (!settings.enabled) {
    return;
  }
  
  // Skip if permission not granted
  const canNative = await canShowNativeNotifications();
  if (!canNative) {
    return;
  }
  
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    
    // Get pending reminders from DB (already filters snoozedUntil)
    const pendingReminders = await getPendingTodayAndOverdueReminders();
    const pendingReminderIds = new Set(pendingReminders.map(r => r.id!));
    
    // Get currently scheduled notifications
    const pending = await LocalNotifications.getPending();
    const scheduledReminderNotifications = pending.notifications
      .filter(n => isReminderNotificationId(n.id));
    
    const scheduledReminderIds = new Set(
      scheduledReminderNotifications.map(n => extractReminderId(n.id))
    );
    
    // Cancel notifications for reminders no longer pending
    const toCancel = scheduledReminderNotifications.filter(
      n => !pendingReminderIds.has(extractReminderId(n.id))
    );
    
    if (toCancel.length > 0) {
      await LocalNotifications.cancel({
        notifications: toCancel.map(n => ({ id: n.id })),
      });
    }
    
    // Schedule new notifications for pending reminders not yet scheduled
    const toSchedule = pendingReminders.filter(
      r => !scheduledReminderIds.has(r.id!)
    );
    
    if (toSchedule.length > 0) {
      const notifications = toSchedule.map(reminder => 
        buildReminderNotification(reminder, language)
      );
      
      await LocalNotifications.schedule({ notifications });
    }
  } catch (error) {
    console.log('Reminder notification reconciliation failed:', error);
  }
}

/**
 * Build notification payload for a reminder.
 */
function buildReminderNotification(reminder: Reminder, language: 'ru' | 'en') {
  const now = Date.now();
  // If dueAt is in the past, schedule for immediate (now + 100ms)
  const scheduleAt = new Date(Math.max(reminder.dueAt, now + 100));
  
  return {
    id: getReminderNotificationId(reminder.id!),
    title: reminder.actionText.slice(0, 50),
    body: formatDueDate(reminder.dueAt, language),
    schedule: { at: scheduleAt },
    extra: {
      type: 'reminder',
      reminderId: reminder.id,
      deepLink: `/reminder/${reminder.id}`,
    },
    smallIcon: 'ic_stat_icon_config_sample',
    iconColor: '#F59E0B', // Amber for reminders
  };
}

// ============================================
// CANCEL OPERATIONS
// ============================================

/**
 * Cancel notification for a specific reminder.
 */
export async function cancelReminderNotification(reminderId: number): Promise<void> {
  if (!isCapacitorNative()) {
    return;
  }
  
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.cancel({
      notifications: [{ id: getReminderNotificationId(reminderId) }],
    });
  } catch {
    // Ignore errors
  }
}

/**
 * Cancel all reminder notifications.
 */
export async function cancelAllReminderNotifications(): Promise<void> {
  if (!isCapacitorNative()) {
    return;
  }
  
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const pending = await LocalNotifications.getPending();
    
    const reminderNotifications = pending.notifications.filter(
      n => isReminderNotificationId(n.id)
    );
    
    if (reminderNotifications.length > 0) {
      await LocalNotifications.cancel({
        notifications: reminderNotifications.map(n => ({ id: n.id })),
      });
    }
  } catch {
    // Ignore errors
  }
}
