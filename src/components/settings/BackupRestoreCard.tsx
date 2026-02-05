import { useState, useRef } from 'react';
import { HardDrive, Upload, Download, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
  exportFullBackup,
  importFullBackup,
  validateBackupManifest,
  getImportSummary,
  downloadBackupFile,
  readBackupFile,
  getLastBackupDate,
  BackupPayload,
  ImportSummary,
  ExportProgress,
} from '@/lib/backupService';
import { formatDistanceToNow } from 'date-fns';
import { ru, enUS, he, ar } from 'date-fns/locale';

const dateLocales = { ru, en: enUS, he, ar };

export function BackupRestoreCard() {
  const { language } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  
  // Import confirmation dialog state
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [pendingImport, setPendingImport] = useState<BackupPayload | null>(null);
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
  };

  const handleExport = async () => {
    setIsExporting(true);
    setExportProgress(null);
    
    try {
      const payload = await exportFullBackup((progress) => {
        setExportProgress(progress);
      });
      
      downloadBackupFile(payload);
      toast.success(t.exportSuccess);
    } catch (error) {
      console.error('Export failed:', error);
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
      const data = await readBackupFile(file);
      
      if (!validateBackupManifest(data)) {
        toast.error(t.invalidFile);
        return;
      }
      
      const summary = getImportSummary(data);
      setImportSummary(summary);
      setPendingImport(data);
      setShowImportConfirm(true);
    } catch (error) {
      console.error('File read failed:', error);
      toast.error(t.invalidFile);
    }
  };

  const handleConfirmImport = async () => {
    if (!pendingImport) return;
    
    setShowImportConfirm(false);
    setIsImporting(true);
    
    try {
      await importFullBackup(pendingImport, { wipeExisting: true });
      toast.success(t.importSuccess);
      
      // Reload to refresh all data
      setTimeout(() => window.location.reload(), 1000);
    } catch (error) {
      console.error('Import failed:', error);
      toast.error(t.error);
    } finally {
      setIsImporting(false);
      setPendingImport(null);
      setImportSummary(null);
    }
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
              onClick={handleExport}
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
              accept=".json"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
          
          {/* Export progress */}
          {exportProgress && (
            <div className="text-xs text-muted-foreground">
              {t.processing}: {exportProgress.table} ({exportProgress.current}/{exportProgress.total})
            </div>
          )}
          
          {/* Last backup info */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle className="h-4 w-4" />
            <span>{t.lastBackup}: {lastBackupText}</span>
          </div>
        </CardContent>
      </Card>
      
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
