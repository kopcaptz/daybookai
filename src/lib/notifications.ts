/**
 * Cross-platform notifications abstraction
 * - Web/PWA: Uses in-app banner (reliable, no permission needed)
 * - Capacitor Native: Uses @capacitor/local-notifications
 */

import { showInAppNotification } from '@/components/NotificationBanner';

// Check if we're running in Capacitor native
export function isCapacitorNative(): boolean {
  return typeof (window as any).Capacitor !== 'undefined' && 
         (window as any).Capacitor.isNativePlatform?.();
}

// Navigation callback for deep-links (set by App.tsx)
let navigationCallback: ((path: string) => void) | null = null;

export function setNavigationCallback(callback: (path: string) => void): void {
  navigationCallback = callback;
}

function navigateToPath(path: string): void {
  if (navigationCallback) {
    navigationCallback(path);
  } else {
    // Fallback to history API if callback not set
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
}

// Permission state for native notifications
let nativePermissionGranted: boolean | null = null;
let nativePermissionDenied = false;

// Request notification permission (Capacitor only)
export async function requestNotificationPermission(): Promise<boolean> {
  if (!isCapacitorNative()) {
    // Web uses in-app banner, no permission needed
    return true;
  }
  
  // Already checked and denied - don't nag
  if (nativePermissionDenied) {
    return false;
  }
  
  // Already granted
  if (nativePermissionGranted === true) {
    return true;
  }
  
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    
    // Check current permission
    const permStatus = await LocalNotifications.checkPermissions();
    
    if (permStatus.display === 'granted') {
      nativePermissionGranted = true;
      return true;
    }
    
    if (permStatus.display === 'denied') {
      nativePermissionDenied = true;
      return false;
    }
    
    // Request permission
    const result = await LocalNotifications.requestPermissions();
    
    if (result.display === 'granted') {
      nativePermissionGranted = true;
      return true;
    } else {
      nativePermissionDenied = true;
      return false;
    }
  } catch {
    // Native notifications not available
    return false;
  }
}

// Check if native notifications are available and permitted
export async function canShowNativeNotifications(): Promise<boolean> {
  if (!isCapacitorNative()) {
    return false;
  }
  
  if (nativePermissionDenied) {
    return false;
  }
  
  if (nativePermissionGranted === true) {
    return true;
  }
  
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const permStatus = await LocalNotifications.checkPermissions();
    nativePermissionGranted = permStatus.display === 'granted';
    nativePermissionDenied = permStatus.display === 'denied';
    return nativePermissionGranted;
  } catch {
    return false;
  }
}

// ============================================
// NOTIFICATION CHANNEL (Android 8+)
// ============================================

let channelCreated = false;

/**
 * Ensure reminders notification channel exists.
 * Must be called before scheduling notifications on Android 8+.
 */
export async function ensureNotificationChannel(): Promise<void> {
  if (!isCapacitorNative() || channelCreated) {
    return;
  }
  
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    
    await LocalNotifications.createChannel({
      id: 'reminders',
      name: 'Напоминания / Reminders',
      description: 'Уведомления о напоминаниях',
      importance: 4, // HIGH - makes sound, shows heads-up
      visibility: 1, // PUBLIC
      sound: 'default',
      vibration: true,
    });
    
    channelCreated = true;
  } catch {
    // Failed to create notification channel
  }
}

// ============================================
// TEST NOTIFICATION (Debug)
// ============================================

/**
 * Schedule a test notification in 5 seconds.
 * Used for debugging notification pipeline.
 */
export async function scheduleTestNotification(): Promise<boolean> {
  if (!isCapacitorNative()) {
    return false;
  }
  
  const canNative = await canShowNativeNotifications();
  if (!canNative) {
    return false;
  }
  
  await ensureNotificationChannel();
  
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    
    const testId = 99999; // Fixed test ID
    
    // Cancel any existing test notification
    await LocalNotifications.cancel({ notifications: [{ id: testId }] });
    
    // Schedule in 5 seconds
    await LocalNotifications.schedule({
      notifications: [{
        id: testId,
        title: 'Тест / Test',
        body: 'Уведомление работает! / Notification works!',
        schedule: { 
          at: new Date(Date.now() + 5000),
          allowWhileIdle: true,
        },
        channelId: 'reminders',
        extra: { type: 'test', deepLink: '/settings' },
        smallIcon: 'ic_stat_icon_config_sample',
        iconColor: '#10B981', // Green for test
      }],
    });
    
    return true;
  } catch {
    // Test notification failed
    return false;
  }
}

// Show biography ready notification
// Accepts Language type from i18n
export async function showBiographyNotification(
  date: string,
  title?: string,
  language: string = 'ru'
): Promise<void> {
  const baseLang = language === 'ru' ? 'ru' : 'en';
  const notificationTitle = title || 
    (baseLang === 'ru' ? 'Биография дня готова' : 'Day biography ready');
  
  const body = baseLang === 'ru'
    ? 'Нажмите, чтобы просмотреть историю дня'
    : 'Tap to view your day story';
  
  const deepLink = `/chat?bio=${date}`;
  
  // Try native notification first for Capacitor
  if (isCapacitorNative()) {
    const canNative = await canShowNativeNotifications();
    if (canNative) {
      await showCapacitorNotification(notificationTitle, body, deepLink, date);
      return;
    }
  }
  
  // Fallback to in-app banner for web/PWA or if native denied
  showInAppBanner(notificationTitle, body, deepLink, date);
}

// In-app banner for web/PWA
function showInAppBanner(
  title: string,
  body: string,
  deepLink: string,
  date: string
): void {
  showInAppNotification({
    title,
    body,
    deepLink,
    date,
  });
}

// Capacitor Local Notifications
async function showCapacitorNotification(
  title: string,
  body: string,
  deepLink: string,
  date: string
): Promise<void> {
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    
    // Schedule immediate notification
    await LocalNotifications.schedule({
      notifications: [
        {
          id: Date.now(),
          title,
          body,
          schedule: { at: new Date(Date.now() + 100) }, // Slight delay for reliability
          extra: { deepLink, date },
          smallIcon: 'ic_stat_icon_config_sample',
          iconColor: '#8B5CF6',
        },
      ],
    });
  } catch {
    // Capacitor notification failed, fallback to banner
    showInAppBanner(title, body, deepLink, date);
  }
}

// Schedule daily reminder notification (Capacitor only)
export async function scheduleDailyReminder(
  bioTime: string,
  language: string = 'ru'
): Promise<boolean> {
  if (!isCapacitorNative()) {
    return false;
  }
  
  const canNative = await canShowNativeNotifications();
  if (!canNative) {
    return false;
  }
  
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    
    // Cancel existing reminders
    const pending = await LocalNotifications.getPending();
    const reminderIds = pending.notifications
      .filter(n => n.extra?.type === 'daily_reminder')
      .map(n => n.id);
    
    if (reminderIds.length > 0) {
      await LocalNotifications.cancel({ notifications: reminderIds.map(id => ({ id })) });
    }
    
    // Parse bioTime
    const [hours, minutes] = bioTime.split(':').map(Number);
    
    // Schedule for today or tomorrow
    const now = new Date();
    const scheduleTime = new Date();
    scheduleTime.setHours(hours, minutes, 0, 0);
    
    if (scheduleTime <= now) {
      scheduleTime.setDate(scheduleTime.getDate() + 1);
    }
    
    const title = language === 'ru' ? 'Пора подвести итоги дня' : 'Time to reflect on your day';
    const body = language === 'ru' 
      ? 'Откройте приложение для генерации биографии'
      : 'Open the app to generate your biography';
    
    await LocalNotifications.schedule({
      notifications: [
        {
          id: 999999, // Fixed ID for daily reminder
          title,
          body,
          schedule: {
            at: scheduleTime,
            repeats: true,
            every: 'day',
          },
          extra: { type: 'daily_reminder', deepLink: '/' },
          smallIcon: 'ic_stat_icon_config_sample',
          iconColor: '#8B5CF6',
        },
      ],
    });
    
    return true;
  } catch {
    // Failed to schedule daily reminder
    return false;
  }
}

// Cancel daily reminder
export async function cancelDailyReminder(): Promise<void> {
  if (!isCapacitorNative()) {
    return;
  }
  
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.cancel({ notifications: [{ id: 999999 }] });
  } catch {
    // Ignore errors
  }
}

// Initialize notification listeners (call on app startup)
export function initNotificationListeners(): void {
  if (!isCapacitorNative()) {
    return;
  }
  
  // Setup Capacitor notification click handler
  import('@capacitor/local-notifications').then(({ LocalNotifications }) => {
    LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
      const data = action.notification.extra;
      
      // Handle reminder notification tap
      if (data?.type === 'reminder' && data?.reminderId) {
        navigateToPath(`/reminder/${data.reminderId}`);
        return;
      }
      
      // Handle other notifications with deepLink
      if (data?.deepLink) {
        navigateToPath(data.deepLink);
      }
    });
  }).catch(() => {
    // Plugin not available
  });
}
