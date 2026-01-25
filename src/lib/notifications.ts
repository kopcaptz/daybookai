/**
 * Cross-platform notifications abstraction
 * - Web/PWA: Uses in-app banner (reliable, no permission needed)
 * - Capacitor Native: Uses @capacitor/local-notifications
 */

import { showInAppNotification } from '@/components/NotificationBanner';

// Check if we're running in Capacitor native
function isCapacitorNative(): boolean {
  return typeof (window as any).Capacitor !== 'undefined' && 
         (window as any).Capacitor.isNativePlatform?.();
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
  } catch (error) {
    console.log('Native notifications not available:', error);
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

// Show biography ready notification
export async function showBiographyNotification(
  date: string,
  title?: string,
  language: 'ru' | 'en' = 'ru'
): Promise<void> {
  const notificationTitle = title || 
    (language === 'ru' ? 'Биография дня готова' : 'Day biography ready');
  
  const body = language === 'ru'
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
  } catch (error) {
    console.log('Capacitor notification error, falling back to banner:', error);
    showInAppBanner(title, body, deepLink, date);
  }
}

// Schedule daily reminder notification (Capacitor only)
export async function scheduleDailyReminder(
  bioTime: string,
  language: 'ru' | 'en' = 'ru'
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
  } catch (error) {
    console.log('Failed to schedule daily reminder:', error);
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
      if (data?.deepLink) {
        // Use history API to navigate without full reload
        window.location.href = data.deepLink;
      }
    });
  }).catch(() => {
    // Plugin not available
  });
}
