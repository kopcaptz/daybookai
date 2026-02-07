import { Cloud, CloudOff, RefreshCw } from 'lucide-react';
import { useSync } from '@/hooks/useSync';
import { cn } from '@/lib/utils';

interface SyncIndicatorProps {
  className?: string;
}

/**
 * Small cloud icon showing sync status.
 * Use on entry cards or in headers.
 */
export function SyncIndicator({ className }: SyncIndicatorProps) {
  const { status, isAuthenticated, lastSynced } = useSync();

  if (!isAuthenticated) return null;

  if (status === 'syncing') {
    return (
      <RefreshCw className={cn("h-3.5 w-3.5 animate-spin text-primary", className)} />
    );
  }

  if (status === 'error') {
    return (
      <CloudOff className={cn("h-3.5 w-3.5 text-destructive", className)} />
    );
  }

  return (
    <Cloud className={cn(
      "h-3.5 w-3.5",
      lastSynced ? "text-primary/70" : "text-muted-foreground/40",
      className
    )} />
  );
}
