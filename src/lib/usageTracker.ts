/**
 * Usage Analytics Tracker
 * Privacy-first: only aggregates, never raw content
 */

import { APP_VERSION } from './appVersion';
import { getExtendedDeviceInfo } from './deviceInfo';
import { getSessionId } from './crashReporter';

const STORAGE_KEY = 'daybook-usage-stats';
const LAST_SUBMIT_KEY = 'daybook-usage-last-submit';

export interface UsageMetrics {
  // Entries
  entriesCreated: number;
  entriesEdited: number;
  totalTextChars: number;
  
  // AI usage
  aiChatMessages: number;
  aiBiographiesGenerated: number;
  aiReceiptsScanned: number;
  autoMoodSuggestions: number;
  autoMoodAccepted: number;
  autoTagsSuggested: number;
  autoTagsAccepted: number;
  
  // Features
  remindersCreated: number;
  discussionSessionsStarted: number;
  feedbackSubmitted: number;
  
  // Session
  sessionDurationMinutes: number;
  pagesVisited: string[];
}

interface StoredUsageData {
  date: string; // YYYY-MM-DD
  sessionStart: number;
  metrics: UsageMetrics;
}

const DEFAULT_METRICS: UsageMetrics = {
  entriesCreated: 0,
  entriesEdited: 0,
  totalTextChars: 0,
  aiChatMessages: 0,
  aiBiographiesGenerated: 0,
  aiReceiptsScanned: 0,
  autoMoodSuggestions: 0,
  autoMoodAccepted: 0,
  autoTagsSuggested: 0,
  autoTagsAccepted: 0,
  remindersCreated: 0,
  discussionSessionsStarted: 0,
  feedbackSubmitted: 0,
  sessionDurationMinutes: 0,
  pagesVisited: [],
};

/**
 * Get today's date as YYYY-MM-DD
 */
function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Load today's stats from localStorage
 */
function loadTodayStats(): StoredUsageData {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const data: StoredUsageData = JSON.parse(stored);
      // Check if it's today's data
      if (data.date === getTodayDate()) {
        return data;
      }
    }
  } catch (e) {
    console.warn('[UsageTracker] Failed to load stats:', e);
  }
  
  // Return fresh data for today
  return {
    date: getTodayDate(),
    sessionStart: Date.now(),
    metrics: { ...DEFAULT_METRICS },
  };
}

/**
 * Save today's stats to localStorage
 */
function saveTodayStats(data: StoredUsageData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('[UsageTracker] Failed to save stats:', e);
  }
}

/**
 * Track an event
 */
export function trackUsageEvent(
  event: keyof Omit<UsageMetrics, 'sessionDurationMinutes' | 'pagesVisited' | 'totalTextChars'>,
  increment: number = 1
): void {
  const data = loadTodayStats();
  (data.metrics[event] as number) += increment;
  saveTodayStats(data);
}

/**
 * Track text length (for aggregate stats)
 */
export function trackTextLength(chars: number): void {
  const data = loadTodayStats();
  data.metrics.totalTextChars += chars;
  saveTodayStats(data);
}

/**
 * Track page visit
 */
export function trackPageVisit(path: string): void {
  const data = loadTodayStats();
  
  // Only track unique pages per session
  if (!data.metrics.pagesVisited.includes(path)) {
    data.metrics.pagesVisited.push(path);
    saveTodayStats(data);
  }
}

/**
 * Check if we should submit stats
 * Submit once every 24 hours
 */
function shouldSubmitStats(): boolean {
  try {
    const lastSubmit = localStorage.getItem(LAST_SUBMIT_KEY);
    if (!lastSubmit) return true;
    
    const lastDate = new Date(lastSubmit);
    const now = new Date();
    
    // Submit if it's been more than 20 hours
    return (now.getTime() - lastDate.getTime()) > 20 * 60 * 60 * 1000;
  } catch {
    return true;
  }
}

/**
 * Submit usage stats to server
 */
async function submitStats(): Promise<void> {
  if (!shouldSubmitStats()) {
    return;
  }
  
  const data = loadTodayStats();
  
  // Calculate session duration
  const sessionDuration = Math.round((Date.now() - data.sessionStart) / 60000);
  data.metrics.sessionDurationMinutes = sessionDuration;
  
  // Get device info
  const deviceInfo = await getExtendedDeviceInfo();
  
  const payload = {
    date: data.date,
    sessionId: getSessionId(),
    appVersion: APP_VERSION,
    deviceInfo,
    metrics: data.metrics,
  };
  
  try {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analytics-submit`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );
    
    if (response.ok) {
      localStorage.setItem(LAST_SUBMIT_KEY, new Date().toISOString());
      console.info('[UsageTracker] Stats submitted successfully');
    }
  } catch (e) {
    console.warn('[UsageTracker] Failed to submit stats:', e);
  }
}

/**
 * Initialize usage tracker - call once on app start
 */
export function initUsageTracker(): void {
  // Ensure we have today's data initialized
  const data = loadTodayStats();
  saveTodayStats(data);
  
  // Submit on page unload using sendBeacon
  window.addEventListener('beforeunload', () => {
    const data = loadTodayStats();
    const sessionDuration = Math.round((Date.now() - data.sessionStart) / 60000);
    data.metrics.sessionDurationMinutes = sessionDuration;
    
    if (shouldSubmitStats()) {
      const payload = JSON.stringify({
        date: data.date,
        sessionId: getSessionId(),
        appVersion: APP_VERSION,
        metrics: data.metrics,
      });
      
      navigator.sendBeacon(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analytics-submit`,
        payload
      );
    }
  });
  
  // Also try to submit periodically (every 30 minutes)
  setInterval(() => {
    submitStats();
  }, 30 * 60 * 1000);
  
  console.info('[UsageTracker] Initialized');
}

/**
 * Force submit stats (for debugging/admin)
 */
export async function forceSubmitStats(): Promise<void> {
  localStorage.removeItem(LAST_SUBMIT_KEY);
  await submitStats();
}

/**
 * Get current stats (for debugging)
 */
export function getCurrentStats(): UsageMetrics {
  return loadTodayStats().metrics;
}
