import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Sun, Moon, Monitor, Download, Trash2, AlertTriangle, HardDrive, Smartphone, Globe, Clock, Shield, Receipt, Bell } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { exportAllData, clearAllData, STORAGE_WARNINGS, loadBioSettings, saveBioSettings } from '@/lib/db';
import { useStorageUsage } from '@/hooks/useStorageUsage';
import { formatFileSize } from '@/lib/mediaUtils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { InstallButton } from '@/components/InstallPrompt';
import { AISettingsCard } from '@/components/AISettingsCard';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useI18n, Language } from '@/lib/i18n';
import { GrimoireIcon } from '@/components/icons/SigilIcon';
import { isCapacitorNative, requestNotificationPermission, scheduleTestNotification } from '@/lib/notifications';
import {
  loadReminderNotificationSettings,
  saveReminderNotificationSettings,
  reconcileReminderNotifications,
  cancelAllReminderNotifications,
} from '@/lib/reminderNotifications';

function SettingsContent() {
  const storage = useStorageUsage();
  const { theme, setTheme } = useTheme();
  const { t, language, setLanguage } = useI18n();
  const [isExporting, setIsExporting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [bioTime, setBioTime] = useState(() => loadBioSettings().bioTime);
  
  // Android-only reminder notifications toggle
  const [reminderNotificationsEnabled, setReminderNotificationsEnabled] = useState(
    () => loadReminderNotificationSettings().enabled
  );
  const [isTestingNotification, setIsTestingNotification] = useState(false);
  
  const handleReminderNotificationsToggle = async (enabled: boolean) => {
    if (enabled) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        toast.error(language === 'ru' ? 'Разрешение отклонено' : 'Permission denied');
        return;
      }
    }
    
    saveReminderNotificationSettings({ enabled });
    setReminderNotificationsEnabled(enabled);
    
    if (enabled) {
      await reconcileReminderNotifications(language);
      toast.success(language === 'ru' ? 'Уведомления включены' : 'Notifications enabled');
    } else {
      await cancelAllReminderNotifications();
      toast.success(language === 'ru' ? 'Уведомления отключены' : 'Notifications disabled');
    }
  };
  
  const handleTestNotification = async () => {
    setIsTestingNotification(true);
    try {
      const granted = await requestNotificationPermission();
      if (!granted) {
        toast.error(language === 'ru' ? 'Разрешение отклонено' : 'Permission denied');
        return;
      }
      
      const scheduled = await scheduleTestNotification();
      if (scheduled) {
        toast.success(language === 'ru' ? 'Уведомление через 5 сек...' : 'Notification in 5 sec...');
      } else {
        toast.error(language === 'ru' ? 'Не удалось запланировать' : 'Failed to schedule');
      }
    } finally {
      setIsTestingNotification(false);
    }
  };

  const handleBioTimeChange = (value: string) => {
    setBioTime(value);
    saveBioSettings({ bioTime: value });
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const data = await exportAllData();
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cyber-grimoire-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(t('settings.exportSuccess'));
    } catch (error) {
      console.error('Export failed:', error);
      toast.error(t('common.error'));
    } finally {
      setIsExporting(false);
    }
  };

  const handleClearData = async () => {
    setIsClearing(true);
    try {
      await clearAllData();
      toast.success(t('settings.clearDataSuccess'));
    } catch (error) {
      console.error('Clear failed:', error);
      toast.error(t('common.error'));
    } finally {
      setIsClearing(false);
    }
  };

  const themeOptions = [
    { value: 'light' as const, label: t('settings.themeLight'), icon: Sun },
    { value: 'dark' as const, label: t('settings.themeDark'), icon: Moon },
    { value: 'system' as const, label: t('settings.themeSystem'), icon: Monitor },
  ];

  const languageOptions: { value: Language; label: string }[] = [
    { value: 'ru', label: 'Русский' },
    { value: 'en', label: 'English' },
  ];

  // Storage percentage for progress bar
  const storagePercent = Math.min((storage.total / STORAGE_WARNINGS.critical) * 100, 100);

  return (
    <div className="min-h-screen pb-24 cyber-noise rune-grid">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl px-4 py-6 border-b border-border/50">
        {/* Brand header */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <GrimoireIcon className="h-6 w-6 text-cyber-sigil" />
          </div>
          <div>
            <h1 className="text-xl font-serif font-medium text-foreground tracking-wide">
              {t('app.name')}
            </h1>
            <p className="text-xs text-cyber-sigil/60 tracking-widest uppercase">
              {t('app.subtitle')}
            </p>
          </div>
        </div>
        
        {/* Rune divider */}
        <div className="mt-4 rune-divider">
          <span className="sigil-separator">◆</span>
        </div>
      </header>

      <main className="space-y-4 px-4 pt-4">
        {/* Language Settings */}
        <Card className="panel-glass border-cyber-glow/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Globe className="h-5 w-5 text-cyber-sigil" />
              {t('settings.language')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              {languageOptions.map((option) => (
                <Button
                  key={option.value}
                  variant="outline"
                  onClick={() => setLanguage(option.value)}
                  className={cn(
                    'flex-1 profile-btn-cyber',
                    language === option.value && 'active'
                  )}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Theme Settings */}
        <Card className="panel-glass border-cyber-glow/20">
          <CardHeader>
            <CardTitle className="text-lg">{t('settings.theme')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              {themeOptions.map((option) => (
                <Button
                  key={option.value}
                  variant="outline"
                  onClick={() => setTheme(option.value)}
                  className={cn(
                    'flex-1 gap-2 profile-btn-cyber',
                    theme === option.value && 'active'
                  )}
                >
                  <option.icon className="h-4 w-4" />
                  {option.label}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Install App */}
        <Card className="panel-glass border-cyber-glow/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Smartphone className="h-5 w-5 text-cyber-sigil" />
              {t('settings.install')}
            </CardTitle>
            <CardDescription>
              {t('settings.installHint')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <InstallButton />
          </CardContent>
        </Card>

        {/* Reminder Notifications (Android only) */}
        {isCapacitorNative() && (
          <Card className="panel-glass border-cyber-glow/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Bell className="h-5 w-5 text-cyber-sigil" />
                {language === 'ru' ? 'Уведомления' : 'Notifications'}
              </CardTitle>
              <CardDescription>
                {language === 'ru' 
                  ? 'Push-уведомления о напоминаниях' 
                  : 'Push notifications for reminders'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm">
                  {language === 'ru' ? 'Включить уведомления' : 'Enable notifications'}
                </span>
                <Switch
                  checked={reminderNotificationsEnabled}
                  onCheckedChange={handleReminderNotificationsToggle}
                />
              </div>
              
              {/* Test notification button */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestNotification}
                disabled={isTestingNotification}
                className="w-full"
              >
                <Bell className="h-4 w-4 mr-2" />
                {isTestingNotification 
                  ? (language === 'ru' ? 'Планирование...' : 'Scheduling...')
                  : (language === 'ru' ? 'Тест (5 сек)' : 'Test (5 sec)')}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Receipt Scanner */}
        <Card className="panel-glass border-cyber-glow/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Receipt className="h-5 w-5 text-cyber-sigil" />
              {language === 'ru' ? 'Чеки' : 'Receipts'}
            </CardTitle>
            <CardDescription>
              {language === 'ru' ? 'Сканирование и учёт покупок' : 'Scan and track purchases'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/receipts">
              <Button variant="outline" className="w-full gap-2">
                <Receipt className="h-4 w-4" />
                {language === 'ru' ? 'Открыть чеки' : 'Open Receipts'}
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* AI Settings */}
        <AISettingsCard />

        {/* Biography Time */}
        <Card className="panel-glass border-cyber-glow/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock className="h-5 w-5 text-cyber-sigil" />
              {t('bio.time')}
            </CardTitle>
            <CardDescription>
              {t('bio.timeHint')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Input
              type="time"
              value={bioTime}
              onChange={(e) => handleBioTimeChange(e.target.value)}
              className="w-32 bg-muted/50 border-border/50"
            />
          </CardContent>
        </Card>

        {/* Storage Usage */}
        <Card className="panel-glass border-cyber-glow/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <HardDrive className="h-5 w-5 text-cyber-sigil" />
              {t('settings.storage')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span>{t('settings.storageUsed')}:</span>
              <span className={cn(
                'font-medium font-mono',
                storage.warning === 'warning' && 'text-yellow-500',
                storage.warning === 'critical' && 'text-destructive'
              )}>
                {storage.formatted}
              </span>
            </div>
            <div className="storage-cyber">
              <div 
                className="bar" 
                style={{ width: `${storagePercent}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0</span>
              <span>{formatFileSize(STORAGE_WARNINGS.warning)}</span>
              <span>{formatFileSize(STORAGE_WARNINGS.critical)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Privacy Info Section */}
        <Card className="panel-glass border-cyber-glow/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Shield className="h-5 w-5 text-cyber-sigil" />
              {t('privacy.title')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex gap-2">
                <span className="text-cyber-sigil/60">•</span>
                <span>{t('privacy.localData')}</span>
              </li>
              <li className="flex gap-2">
                <span className="text-cyber-sigil/60">•</span>
                <span>{t('privacy.chatData')}</span>
              </li>
              <li className="flex gap-2">
                <span className="text-cyber-sigil/60">•</span>
                <span>{t('privacy.chronicleData')}</span>
              </li>
              <li className="flex gap-2">
                <span className="text-cyber-sigil/60">•</span>
                <span>{t('privacy.photoData')}</span>
              </li>
              <li className="flex gap-2">
                <span className="text-cyber-sigil/60">•</span>
                <span>{t('privacy.strictMode')}</span>
              </li>
            </ul>
          </CardContent>
        </Card>

        {/* Export Data */}
        <Card className="panel-glass border-cyber-glow/20">
          <CardHeader>
            <CardTitle className="text-lg">{t('settings.export')}</CardTitle>
            <CardDescription>
              {t('settings.exportHint')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={handleExport}
              disabled={isExporting}
              variant="outline"
              className="w-full gap-2"
            >
              <Download className="h-4 w-4" />
              {isExporting ? t('common.loading') : t('settings.export')}
            </Button>
          </CardContent>
        </Card>

        {/* Clear Data */}
        <Card className="panel-glass border-destructive/30">
          <CardHeader>
            <CardTitle className="text-lg text-destructive">{t('settings.clearData')}</CardTitle>
            <CardDescription>
              {t('settings.clearDataDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  className="w-full gap-2"
                  disabled={isClearing}
                >
                  <Trash2 className="h-4 w-4" />
                  {t('settings.clearData')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="panel-glass">
                <AlertDialogHeader>
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                    <AlertTriangle className="h-6 w-6 text-destructive" />
                  </div>
                  <AlertDialogTitle className="text-center">
                    {t('settings.clearDataConfirm')}
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-center">
                    {t('settings.clearDataDesc')}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
                  <AlertDialogAction
                    onClick={handleClearData}
                    className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {t('common.confirm')}
                  </AlertDialogAction>
                  <AlertDialogCancel className="w-full">{t('common.cancel')}</AlertDialogCancel>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>

        {/* App Info */}
        <Card className="panel-glass border-cyber-glow/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <GrimoireIcon className="h-5 w-5 text-cyber-sigil" />
              {t('app.name')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p className="text-xs uppercase tracking-widest text-cyber-sigil/60">{t('app.tagline')}</p>
            <p>{t('settings.version')}: 1.0.0</p>
            <p className="text-xs text-muted-foreground/60 font-mono">
              Build: {import.meta.env.MODE === 'production' ? new Date().toISOString().slice(0, 16).replace('T', ' ') : 'dev'}
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <ErrorBoundary>
      <SettingsContent />
    </ErrorBoundary>
  );
}
