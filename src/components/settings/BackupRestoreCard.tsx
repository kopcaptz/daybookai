import { useState, useRef, useEffect } from 'react';
import { HardDrive, Upload, Download, AlertTriangle, CheckCircle, Loader2, X } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n';
import {
  exportBackupZip,
  importBackupZip,
  importFullBackup,
  readBackupFile,
  getLastBackupDate,
  getImportSummary,
  getImportSummaryFromManifest,
  estimateBackupSize,
  downloadBackupZip,
  shouldShowBackupReminder,
  dismissBackupReminder,
  getDaysSinceLastBackup,
  BackupPayload,
  BackupManifest,
  ImportSummary,
  DetailedProgress,
} from '@/lib/backupService';
import { formatDistanceToNow } from 'date-fns';
import { ru, enUS, he, ar } from 'date-fns/locale';
import { formatFileSize } from '@/lib/mediaUtils';
import { cn } from '@/lib/utils';

const dateLocales = { ru, en: enUS, he, ar };

// 50MB warning threshold
const SIZE_WARNING_THRESHOLD = 50 * 1024 * 1024;

export function BackupReminderBanner() {
  const { language } = useI18n();
  const [visible, setVisible] = useState(() => shouldShowBackupReminder());
  
  const daysSince = getDaysSinceLastBackup();
  
  const t = {
    reminder: language === 'ru' 
      ? `Последний бэкап: ${daysSince === null ? 'никогда' : `${daysSince} дн. назад`}`
      : language === 'he'
        ? `גיבוי אחרון: ${daysSince === null ? 'אף פעם' : `לפני ${daysSince} ימים`}`
        : language === 'ar'
          ? `آخر نسخة: ${daysSince === null ? 'أبداً' : `منذ ${daysSince} يوم`}`
          : `Last backup: ${daysSince === null ? 'never' : `${daysSince} days ago`}`,
    recommend: language === 'ru' 
      ? 'Рекомендуем сделать новый бэкап'
      : language === 'he'
        ? 'מומלץ לבצע גיבוי חדש'
        : language === 'ar'
          ? 'ننصح بإنشاء نسخة احتياطية جديدة'
          : 'We recommend creating a new backup',
  };

  const handleDismiss = () => {
    dismissBackupReminder();
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 mb-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-foreground">{t.reminder}</p>
            <p className="text-muted-foreground text-xs">{t.recommend}</p>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="p-1 rounded hover:bg-muted/50"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}

export function BackupRestoreCard() {
  const { language } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<DetailedProgress | null>(null);
  const [importProgress, setImportProgress] = useState<DetailedProgress | null>(null);
  
  // Size warning state
  const [showSizeWarning, setShowSizeWarning] = useState(false);
  const [estimatedSize, setEstimatedSize] = useState(0);
  
  // Import confirmation dialog state
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [pendingImportFile, setPendingImportFile] = useState<{ type: 'json' | 'zip'; data: BackupPayload | Blob; manifest?: BackupManifest } | null>(null);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  
  const lastBackup = getLastBackupDate();
  const lastBackupText = lastBackup
    ? formatDistanceToNow(new Date(lastBackup), { 
        addSuffix: true, 
        locale: dateLocales[language] 
      })
    : (language === 'ru' ? 'Никогда' : language === 'he' ? 'אף פעם' : language === 'ar' ? 'أبداً' : 'Never');

  // Translations
  const t = {
    title: language === 'ru' ? 'Резервное копирование' : language === 'he' ? 'גיבוי ושחזור' : language === 'ar' ? 'النسخ الاحتياطي والاستعادة' : 'Backup & Restore',
    warning: language === 'ru' 
      ? 'Удаление приложения или очистка данных сайта удаляет память. Сделайте бэкап перед этим!' 
      : language === 'he' 
        ? 'מחיקת האפליקציה או ניקוי נתוני האתר מוחקת את הזיכרון. גבה לפני כן!'
        : language === 'ar'
          ? 'حذف التطبيق أو مسح بيانات الموقع يحذف الذاكرة. قم بالنسخ الاحتياطي قبل ذلك!'
          : 'Deleting the app or clearing site data erases memory. Backup first!',
    export: language === 'ru' ? 'Экспорт' : language === 'he' ? 'ייצוא' : language === 'ar' ? 'تصدير' : 'Export',
    import: language === 'ru' ? 'Импорт' : language === 'he' ? 'ייבוא' : language === 'ar' ? 'استيراد' : 'Import',
    exporting: language === 'ru' ? 'Экспорт...' : language === 'he' ? 'מייצא...' : language === 'ar' ? 'جاري التصدير...' : 'Exporting...',
    importing: language === 'ru' ? 'Импорт...' : language === 'he' ? 'מייבא...' : language === 'ar' ? 'جاري الاستيراد...' : 'Importing...',
    lastBackup: language === 'ru' ? 'Последний бэкап' : language === 'he' ? 'גיבוי אחרון' : language === 'ar' ? 'آخر نسخة احتياطية' : 'Last backup',
    exportSuccess: language === 'ru' ? 'Бэкап создан' : language === 'he' ? 'הגיבוי נוצר' : language === 'ar' ? 'تم إنشاء النسخة الاحتياطية' : 'Backup created',
    importSuccess: language === 'ru' ? 'Данные восстановлены' : language === 'he' ? 'הנתונים שוחזרו' : language === 'ar' ? 'تم استعادة البيانات' : 'Data restored',
    invalidFile: language === 'ru' ? 'Неверный формат файла' : language === 'he' ? 'פורמט קובץ לא תקין' : language === 'ar' ? 'تنسيق ملف غير صالح' : 'Invalid file format',
    confirmTitle: language === 'ru' ? 'Восстановить данные?' : language === 'he' ? 'לשחזר נתונים?' : language === 'ar' ? 'استعادة البيانات؟' : 'Restore data?',
    confirmDesc: language === 'ru' 
      ? 'Текущие данные будут заменены данными из бэкапа.' 
      : language === 'he' 
        ? 'הנתונים הנוכחיים יוחלפו בנתונים מהגיבוי.'
        : language === 'ar'
          ? 'سيتم استبدال البيانات الحالية ببيانات النسخة الاحتياطية.'
          : 'Current data will be replaced with backup data.',
    willRestore: language === 'ru' ? 'Будет восстановлено' : language === 'he' ? 'ישוחזר' : language === 'ar' ? 'سيتم استعادة' : 'Will restore',
    entries: language === 'ru' ? 'записей' : language === 'he' ? 'רשומות' : language === 'ar' ? 'مدخلات' : 'entries',
    attachments: language === 'ru' ? 'вложений' : language === 'he' ? 'קבצים מצורפים' : language === 'ar' ? 'مرفقات' : 'attachments',
    reminders: language === 'ru' ? 'напоминаний' : language === 'he' ? 'תזכורות' : language === 'ar' ? 'تذكيرات' : 'reminders',
    receipts: language === 'ru' ? 'чеков' : language === 'he' ? 'קבלות' : language === 'ar' ? 'إيصالات' : 'receipts',
    cancel: language === 'ru' ? 'Отмена' : language === 'he' ? 'ביטול' : language === 'ar' ? 'إلغاء' : 'Cancel',
    confirm: language === 'ru' ? 'Восстановить' : language === 'he' ? 'שחזר' : language === 'ar' ? 'استعادة' : 'Restore',
    error: language === 'ru' ? 'Ошибка' : language === 'he' ? 'שגיאה' : language === 'ar' ? 'خطأ' : 'Error',
    processing: language === 'ru' ? 'Обработка' : language === 'he' ? 'מעבד' : language === 'ar' ? 'معالجة' : 'Processing',
    sizeWarningTitle: language === 'ru' ? 'Большой бэкап' : language === 'he' ? 'גיבוי גדול' : language === 'ar' ? 'نسخة كبيرة' : 'Large Backup',
    sizeWarningDesc: language === 'ru' 
      ? 'Бэкап может быть большим. Убедитесь, что у вас достаточно места.'
      : language === 'he'
        ? 'הגיבוי עשוי להיות גדול. ודא שיש לך מספיק מקום.'
        : language === 'ar'
          ? 'قد تكون النسخة الاحتياطية كبيرة. تأكد من وجود مساحة كافية.'
          : 'Backup may be large. Make sure you have enough space.',
    continue: language === 'ru' ? 'Продолжить' : language === 'he' ? 'המשך' : language === 'ar' ? 'متابعة' : 'Continue',
  };

  const handleExportClick = async () => {
    // Check size first
    const size = await estimateBackupSize();
    if (size > SIZE_WARNING_THRESHOLD) {
      setEstimatedSize(size);
      setShowSizeWarning(true);
      return;
    }
    
    await performExport();
  };

  const performExport = async () => {
    setShowSizeWarning(false);
    setIsExporting(true);
    setExportProgress(null);
    
    try {
      const zipBlob = await exportBackupZip((progress) => {
        setExportProgress(progress);
      });
      
      downloadBackupZip(zipBlob);
      toast.success(t.exportSuccess);
    } catch (error) {
      console.error('[Backup] Export failed:', error);
      toast.error(t.error);
    } finally {
      setIsExporting(false);
      setExportProgress(null);
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    // Reset input so same file can be selected again
    event.target.value = '';
    
    try {
      const result = await readBackupFile(file);
      
      let summary: ImportSummary;
      if (result.type === 'zip' && result.manifest) {
        summary = getImportSummaryFromManifest(result.manifest);
      } else if (result.type === 'json') {
        summary = getImportSummary(result.data as BackupPayload);
      } else {
        toast.error(t.invalidFile);
        return;
      }
      
      setImportSummary(summary);
      setPendingImportFile(result);
      setShowImportConfirm(true);
    } catch (error) {
      console.error('[Backup] File read failed:', error);
      toast.error(t.invalidFile);
    }
  };

  const handleConfirmImport = async () => {
    if (!pendingImportFile) return;
    
    setShowImportConfirm(false);
    setIsImporting(true);
    setImportProgress(null);
    
    try {
      if (pendingImportFile.type === 'zip') {
        await importBackupZip(
          pendingImportFile.data as Blob, 
          { wipeExisting: true },
          (progress) => setImportProgress(progress)
        );
      } else {
        await importFullBackup(
          pendingImportFile.data as BackupPayload, 
          { wipeExisting: true }
        );
      }
      
      toast.success(t.importSuccess);
      
      // Reload to refresh all data
      setTimeout(() => window.location.reload(), 1000);
    } catch (error) {
      console.error('[Backup] Import failed:', error);
      toast.error(t.error);
    } finally {
      setIsImporting(false);
      setPendingImportFile(null);
      setImportSummary(null);
      setImportProgress(null);
    }
  };

  // Progress display component
  const ProgressDisplay = ({ progress, label }: { progress: DetailedProgress | null; label: string }) => {
    if (!progress) return null;
    
    return (
      <div className="space-y-2 mt-3">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{label}</span>
          <span>{progress.overallPercent}%</span>
        </div>
        <Progress value={progress.overallPercent} className="h-2" />
        
        {/* Table status list */}
        <div className="max-h-32 overflow-y-auto space-y-1">
          {progress.tables.map((table) => (
            <div key={table.name} className="flex items-center gap-2 text-xs">
              <span className={cn(
                'w-4 text-center',
                table.status === 'done' && 'text-green-500',
                table.status === 'processing' && 'text-primary animate-pulse',
                table.status === 'pending' && 'text-muted-foreground/50',
              )}>
                {table.status === 'done' ? '✓' : table.status === 'processing' ? '→' : '○'}
              </span>
              <span className={cn(
                'flex-1',
                table.status === 'pending' && 'text-muted-foreground/50'
              )}>
                {table.name}
              </span>
              {table.status !== 'pending' && table.total !== undefined && table.total > 0 && (
                <span className="text-muted-foreground">
                  ({table.current ?? 0}/{table.total})
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <>
      <Card className="panel-glass border-cyber-glow/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <HardDrive className="h-5 w-5 text-cyber-sigil" />
            {t.title}
          </CardTitle>
          <CardDescription className="flex items-start gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{t.warning}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Export/Import buttons */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={handleExportClick}
              disabled={isExporting || isImporting}
            >
              {isExporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {isExporting ? t.exporting : t.export}
            </Button>
            
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={() => fileInputRef.current?.click()}
              disabled={isExporting || isImporting}
            >
              {isImporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {isImporting ? t.importing : t.import}
            </Button>
            
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.zip"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
          
          {/* Export progress */}
          {isExporting && <ProgressDisplay progress={exportProgress} label={t.exporting} />}
          
          {/* Import progress */}
          {isImporting && <ProgressDisplay progress={importProgress} label={t.importing} />}
          
          {/* Last backup info */}
          {!isExporting && !isImporting && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle className="h-4 w-4" />
              <span>{t.lastBackup}: {lastBackupText}</span>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Size warning dialog */}
      <AlertDialog open={showSizeWarning} onOpenChange={setShowSizeWarning}>
        <AlertDialogContent className="panel-glass">
          <AlertDialogHeader>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10">
              <AlertTriangle className="h-6 w-6 text-amber-500" />
            </div>
            <AlertDialogTitle className="text-center">
              {t.sizeWarningTitle}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center">
              {t.sizeWarningDesc}
              <br />
              <span className="font-mono text-foreground">~{formatFileSize(estimatedSize)}</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
            <AlertDialogAction onClick={performExport} className="w-full">
              {t.continue}
            </AlertDialogAction>
            <AlertDialogCancel className="w-full">{t.cancel}</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Import confirmation dialog */}
      <AlertDialog open={showImportConfirm} onOpenChange={setShowImportConfirm}>
        <AlertDialogContent className="panel-glass">
          <AlertDialogHeader>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <AlertTriangle className="h-6 w-6 text-primary" />
            </div>
            <AlertDialogTitle className="text-center">
              {t.confirmTitle}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center">
              {t.confirmDesc}
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          {importSummary && (
            <div className="bg-muted rounded-lg p-3 space-y-1 text-sm">
              <p className="font-medium mb-2">{t.willRestore}:</p>
              <ul className="space-y-1 text-muted-foreground">
                {importSummary.entries > 0 && (
                  <li>• {importSummary.entries} {t.entries}</li>
                )}
                {importSummary.attachments > 0 && (
                  <li>• {importSummary.attachments} {t.attachments}</li>
                )}
                {importSummary.reminders > 0 && (
                  <li>• {importSummary.reminders} {t.reminders}</li>
                )}
                {importSummary.receipts > 0 && (
                  <li>• {importSummary.receipts} {t.receipts}</li>
                )}
              </ul>
            </div>
          )}
          
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
            <AlertDialogAction
              onClick={handleConfirmImport}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {t.confirm}
            </AlertDialogAction>
            <AlertDialogCancel className="w-full">{t.cancel}</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
