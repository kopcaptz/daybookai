import { useState, useEffect } from 'react';
import { getStorageUsage, STORAGE_WARNINGS } from '@/lib/db';
import { formatFileSize } from '@/lib/mediaUtils';

interface StorageInfo {
  total: number;
  formatted: string;
  warning: 'none' | 'warning' | 'critical';
  isLoading: boolean;
}

export function useStorageUsage(refreshKey?: number): StorageInfo {
  const [info, setInfo] = useState<StorageInfo>({
    total: 0,
    formatted: '0 Б',
    warning: 'none',
    isLoading: true,
  });

  useEffect(() => {
    let cancelled = false;

    const fetchUsage = async () => {
      try {
        const usage = await getStorageUsage();
        
        if (cancelled) return;

        let warning: 'none' | 'warning' | 'critical' = 'none';
        if (usage.total >= STORAGE_WARNINGS.critical) {
          warning = 'critical';
        } else if (usage.total >= STORAGE_WARNINGS.warning) {
          warning = 'warning';
        }

        setInfo({
          total: usage.total,
          formatted: formatFileSize(usage.total),
          warning,
          isLoading: false,
        });
      } catch (error) {
        console.error('Failed to get storage usage:', error);
        if (!cancelled) {
          setInfo(prev => ({ ...prev, isLoading: false }));
        }
      }
    };

    fetchUsage();

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return info;
}
