import { db, ScanLog, addScanLog, getAllScanLogs, clearScanLogs } from './db';
import { logger } from './logger';

/**
 * Log a scan attempt (privacy-safe: no image content, only metadata)
 */
export async function logScanAttempt(data: Omit<ScanLog, 'id'>): Promise<void> {
  try {
    await addScanLog(data);
    logger.info('ScanDiagnostics', 'Logged scan attempt', {
      timestamp: new Date(data.timestamp).toISOString(),
      originalKB: Math.round(data.originalImageBytes / 1024),
      compressedKB: Math.round(data.compressedBytes / 1024),
      durationMs: data.durationMs,
      status: data.httpStatus,
      error: data.errorCode,
      requestId: data.requestId.slice(0, 8),
    });
  } catch (error) {
    logger.error('ScanDiagnostics', 'Failed to log scan attempt', error as Error);
  }
}

/**
 * Export scan logs as JSON (privacy-safe download)
 */
export async function exportScanDiagnostics(): Promise<string> {
  const logs = await getAllScanLogs();
  
  // Format logs for readability
  const formatted = logs.map(log => ({
    ...log,
    timestampISO: new Date(log.timestamp).toISOString(),
    originalKB: Math.round(log.originalImageBytes / 1024),
    compressedKB: Math.round(log.compressedBytes / 1024),
  }));

  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    totalScans: logs.length,
    logs: formatted,
  }, null, 2);
}

/**
 * Download diagnostics as JSON file
 */
export async function downloadDiagnostics(): Promise<boolean> {
  const logs = await getAllScanLogs();
  if (logs.length === 0) {
    return false;
  }

  const json = await exportScanDiagnostics();
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `scan_diagnostics_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  
  return true;
}

/**
 * Get scan statistics
 */
export async function getScanStats(): Promise<{
  totalScans: number;
  successfulScans: number;
  failedScans: number;
  avgDurationMs: number;
  avgCompressionRatio: number;
}> {
  const logs = await getAllScanLogs();
  
  if (logs.length === 0) {
    return {
      totalScans: 0,
      successfulScans: 0,
      failedScans: 0,
      avgDurationMs: 0,
      avgCompressionRatio: 0,
    };
  }

  const successful = logs.filter(l => l.httpStatus === 200 && !l.errorCode);
  const failed = logs.filter(l => l.httpStatus !== 200 || l.errorCode);
  
  const avgDuration = logs.reduce((sum, l) => sum + l.durationMs, 0) / logs.length;
  const avgCompression = logs.reduce((sum, l) => {
    if (l.originalImageBytes > 0) {
      return sum + (l.compressedBytes / l.originalImageBytes);
    }
    return sum;
  }, 0) / logs.length;

  return {
    totalScans: logs.length,
    successfulScans: successful.length,
    failedScans: failed.length,
    avgDurationMs: Math.round(avgDuration),
    avgCompressionRatio: Math.round(avgCompression * 100) / 100,
  };
}

export { clearScanLogs };
