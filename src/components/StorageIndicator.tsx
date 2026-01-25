import { HardDrive, AlertTriangle, AlertCircle } from 'lucide-react';
import { useStorageUsage } from '@/hooks/useStorageUsage';
import { cn } from '@/lib/utils';

interface StorageIndicatorProps {
  refreshKey?: number;
  showLabel?: boolean;
}

export function StorageIndicator({ refreshKey, showLabel = true }: StorageIndicatorProps) {
  const { formatted, warning, isLoading } = useStorageUsage(refreshKey);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <HardDrive className="h-4 w-4 animate-pulse" />
        {showLabel && <span>Загрузка...</span>}
      </div>
    );
  }

  const Icon = warning === 'critical' 
    ? AlertCircle 
    : warning === 'warning' 
      ? AlertTriangle 
      : HardDrive;

  return (
    <div
      className={cn(
        'flex items-center gap-2 text-sm',
        warning === 'none' && 'text-muted-foreground',
        warning === 'warning' && 'text-yellow-600 dark:text-yellow-500',
        warning === 'critical' && 'text-destructive'
      )}
    >
      <Icon className="h-4 w-4" />
      {showLabel && (
        <span>
          {formatted}
          {warning === 'warning' && ' — хранилище заполняется'}
          {warning === 'critical' && ' — критически мало места!'}
        </span>
      )}
    </div>
  );
}
