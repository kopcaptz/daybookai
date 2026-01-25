import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, BookOpen, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface NotificationData {
  id: string;
  title: string;
  body: string;
  deepLink?: string;
  date?: string;
}

// Global notification state
let notificationQueue: NotificationData[] = [];
let notifyListeners: (() => void)[] = [];

function notifyChange() {
  notifyListeners.forEach(fn => fn());
}

// Public API to show notifications
export function showInAppNotification(data: Omit<NotificationData, 'id'>): void {
  const notification: NotificationData = {
    ...data,
    id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  };
  notificationQueue.push(notification);
  notifyChange();
  
  // Auto-dismiss after 10 seconds
  setTimeout(() => {
    dismissNotification(notification.id);
  }, 10000);
}

export function dismissNotification(id: string): void {
  notificationQueue = notificationQueue.filter(n => n.id !== id);
  notifyChange();
}

export function clearAllNotifications(): void {
  notificationQueue = [];
  notifyChange();
}

// Hook to subscribe to notifications
function useNotifications() {
  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  
  useEffect(() => {
    const update = () => setNotifications([...notificationQueue]);
    notifyListeners.push(update);
    update(); // Initial sync
    
    return () => {
      notifyListeners = notifyListeners.filter(fn => fn !== update);
    };
  }, []);
  
  return notifications;
}

// The banner component that renders notifications
export function NotificationBanner() {
  const navigate = useNavigate();
  const notifications = useNotifications();
  
  const handleClick = useCallback((notification: NotificationData) => {
    if (notification.deepLink) {
      navigate(notification.deepLink);
    }
    dismissNotification(notification.id);
  }, [navigate]);
  
  const handleDismiss = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    dismissNotification(id);
  }, []);
  
  if (notifications.length === 0) return null;
  
  // Show only the most recent notification
  const notification = notifications[notifications.length - 1];
  
  return (
    <div className="fixed top-0 left-0 right-0 z-50 p-2 animate-slide-down">
      <div
        onClick={() => handleClick(notification)}
        className={cn(
          'mx-auto max-w-md rounded-xl p-4 cursor-pointer',
          'bg-primary/95 text-primary-foreground shadow-lg backdrop-blur-sm',
          'border border-primary-foreground/20',
          'transition-all hover:scale-[1.02] active:scale-[0.98]'
        )}
      >
        <div className="flex items-start gap-3">
          <div className="relative shrink-0">
            <div className="rounded-full bg-primary-foreground/20 p-2">
              <BookOpen className="h-5 w-5" />
            </div>
            <Sparkles className="absolute -top-1 -right-1 h-3 w-3 text-magic-gold animate-sparkle" />
          </div>
          
          <div className="flex-1 min-w-0">
            <h4 className="font-serif font-semibold text-sm">
              {notification.title}
            </h4>
            <p className="text-xs opacity-90 mt-0.5 font-serif">
              {notification.body}
            </p>
          </div>
          
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 h-6 w-6 hover:bg-primary-foreground/20"
            onClick={(e) => handleDismiss(e, notification.id)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
