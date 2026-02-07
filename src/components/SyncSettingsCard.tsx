import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Cloud, CloudOff, RefreshCw, LogOut, Upload, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/hooks/useAuth';
import { useSync } from '@/hooks/useSync';
import { useI18n } from '@/lib/i18n';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export function SyncSettingsCard() {
  const { language } = useI18n();
  const { user, isAuthenticated, signOut } = useAuth();
  const { status, lastSynced, migrationProgress, syncNow, migrateData } = useSync();
  const [syncPrivate, setSyncPrivate] = useState(
    () => localStorage.getItem('daybook-sync-private') === 'true'
  );
  const [showMigration, setShowMigration] = useState(false);

  const t = (ru: string, en: string) => language === 'ru' ? ru : en;

  const handleSyncNow = async () => {
    try {
      const result = await syncNow();
      if (result) {
        toast.success(t(
          `Синхронизировано: ↑${result.uploaded} ↓${result.downloaded}`,
          `Synced: ↑${result.uploaded} ↓${result.downloaded}`
        ));
      }
    } catch {
      toast.error(t('Ошибка синхронизации', 'Sync error'));
    }
  };

  const handleMigrate = async () => {
    try {
      const result = await migrateData();
      if (result) {
        toast.success(t(
          `Загружено ${result.entries} записей и ${result.attachments} вложений`,
          `Uploaded ${result.entries} entries and ${result.attachments} attachments`
        ));
        setShowMigration(false);
      }
    } catch {
      toast.error(t('Ошибка миграции', 'Migration error'));
    }
  };

  const handleSignOut = async () => {
    const { error } = await signOut();
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(t('Вы вышли из аккаунта', 'Signed out'));
    }
  };

  const handleSyncPrivateToggle = (enabled: boolean) => {
    setSyncPrivate(enabled);
    localStorage.setItem('daybook-sync-private', String(enabled));
  };

  const formatLastSynced = (iso: string | null) => {
    if (!iso) return t('никогда', 'never');
    const d = new Date(iso);
    const now = new Date();
    const diffMin = Math.round((now.getTime() - d.getTime()) / 60000);
    if (diffMin < 1) return t('только что', 'just now');
    if (diffMin < 60) return `${diffMin} ${t('мин назад', 'min ago')}`;
    return d.toLocaleTimeString(language === 'ru' ? 'ru-RU' : 'en-US', { hour: '2-digit', minute: '2-digit' });
  };

  if (!isAuthenticated) {
    return (
      <Card className="panel-glass border-cyber-glow/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CloudOff className="h-5 w-5 text-muted-foreground" />
            {t('Облачная синхронизация', 'Cloud Sync')}
          </CardTitle>
          <CardDescription>
            {t('Войдите для синхронизации записей между устройствами', 'Sign in to sync entries across devices')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link to="/auth">
            <Button variant="outline" className="w-full gap-2">
              <Cloud className="h-4 w-4" />
              {t('Войти для синхронизации', 'Sign in to sync')}
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="panel-glass border-cyber-glow/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Cloud className="h-5 w-5 text-cyber-sigil" />
          {t('Облачная синхронизация', 'Cloud Sync')}
        </CardTitle>
        <CardDescription className="truncate">
          {user?.email}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Sync status */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{t('Последняя синхронизация', 'Last synced')}</span>
          <span className="flex items-center gap-1.5">
            {status === 'syncing' ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" />
            ) : lastSynced ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
            ) : (
              <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            <span className="font-mono text-xs">{formatLastSynced(lastSynced)}</span>
          </span>
        </div>

        {/* Sync now button */}
        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={handleSyncNow}
          disabled={status === 'syncing'}
        >
          <RefreshCw className={cn("h-4 w-4", status === 'syncing' && "animate-spin")} />
          {status === 'syncing'
            ? t('Синхронизация...', 'Syncing...')
            : t('Синхронизировать сейчас', 'Sync now')
          }
        </Button>

        {/* Sync private entries toggle */}
        <div className="flex items-center justify-between">
          <span className="text-sm">{t('Синхронизировать приватные', 'Sync private entries')}</span>
          <Switch
            checked={syncPrivate}
            onCheckedChange={handleSyncPrivateToggle}
          />
        </div>

        {/* Migration */}
        {!lastSynced && !showMigration && (
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={() => setShowMigration(true)}
          >
            <Upload className="h-4 w-4" />
            {t('Загрузить записи в облако', 'Upload entries to cloud')}
          </Button>
        )}

        {showMigration && (
          <div className="space-y-3 p-3 rounded-lg bg-muted/30 border border-border/50">
            <p className="text-sm text-muted-foreground">
              {t(
                'Все существующие записи будут загружены в облако. Это одноразовая операция.',
                'All existing entries will be uploaded to the cloud. This is a one-time operation.'
              )}
            </p>
            {migrationProgress && (
              <div className="space-y-1">
                <Progress value={(migrationProgress.current / Math.max(migrationProgress.total, 1)) * 100} />
                <p className="text-xs text-muted-foreground text-center">
                  {migrationProgress.current} / {migrationProgress.total}
                </p>
              </div>
            )}
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1 gap-1"
                onClick={handleMigrate}
                disabled={status === 'syncing'}
              >
                <Upload className="h-3.5 w-3.5" />
                {t('Загрузить', 'Upload')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => setShowMigration(false)}
                disabled={status === 'syncing'}
              >
                {t('Отмена', 'Cancel')}
              </Button>
            </div>
          </div>
        )}

        {/* Sign out */}
        <Button
          variant="ghost"
          className="w-full gap-2 text-muted-foreground hover:text-destructive"
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4" />
          {t('Выйти из аккаунта', 'Sign out')}
        </Button>
      </CardContent>
    </Card>
  );
}
