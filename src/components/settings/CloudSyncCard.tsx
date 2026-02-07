import { useMemo, useState } from 'react';
import { Cloud, Copy, RefreshCw, Link as LinkIcon, KeyRound } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n';
import {
  formatSyncKey,
  generateCloudSyncKey,
  getCloudSyncKey,
  getLastCloudSyncAt,
  isCloudSyncEnabled,
  setCloudSyncEnabled,
  setCloudSyncKey,
  syncNow,
} from '@/lib/cloudSyncService';
import { formatDistanceToNow } from 'date-fns';
import { ru, enUS, he, ar } from 'date-fns/locale';

const dateLocales = { ru, en: enUS, he, ar };

export function CloudSyncCard() {
  const { language } = useI18n();
  const [enabled, setEnabled] = useState(isCloudSyncEnabled());
  const [syncKey, setSyncKeyState] = useState(getCloudSyncKey() ?? '');
  const [linkKeyInput, setLinkKeyInput] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState(getLastCloudSyncAt());

  const t = {
    title: language === 'ru' ? 'Облачная синхронизация' : 'Cloud Sync',
    desc: language === 'ru'
      ? 'Синхронизация записей между устройствами. Вложения остаются локальными.'
      : 'Sync entries across devices. Attachments stay local.',
    enable: language === 'ru' ? 'Включить синхронизацию' : 'Enable sync',
    keyLabel: language === 'ru' ? 'Ключ синхронизации' : 'Sync key',
    keyHint: language === 'ru'
      ? 'Сохраните ключ — он нужен для подключения других устройств.'
      : 'Keep this key to link other devices.',
    copy: language === 'ru' ? 'Копировать' : 'Copy',
    linkTitle: language === 'ru' ? 'Подключить устройство' : 'Link a device',
    linkHint: language === 'ru'
      ? 'Вставьте ключ, чтобы синхронизировать с другим устройством.'
      : 'Paste a key to sync with another device.',
    linkPlaceholder: language === 'ru' ? 'Ключ синхронизации' : 'Sync key',
    linkButton: language === 'ru' ? 'Использовать ключ' : 'Use key',
    syncNow: language === 'ru' ? 'Синхронизировать' : 'Sync now',
    syncing: language === 'ru' ? 'Синхронизация...' : 'Syncing...',
    lastSync: language === 'ru' ? 'Последняя синхронизация' : 'Last sync',
    never: language === 'ru' ? 'никогда' : 'never',
    copied: language === 'ru' ? 'Ключ скопирован' : 'Key copied',
    invalidKey: language === 'ru' ? 'Короткий ключ' : 'Key too short',
    syncSuccess: language === 'ru' ? 'Синхронизация завершена' : 'Sync complete',
    syncFailed: language === 'ru' ? 'Ошибка синхронизации' : 'Sync failed',
  };

  const formattedKey = useMemo(() => (syncKey ? formatSyncKey(syncKey) : ''), [syncKey]);
  const lastSyncText = lastSyncAt
    ? formatDistanceToNow(new Date(lastSyncAt), { addSuffix: true, locale: dateLocales[language] })
    : t.never;

  const handleCopy = async () => {
    if (!formattedKey) return;
    try {
      await navigator.clipboard.writeText(formattedKey);
      toast.success(t.copied);
    } catch {
      toast.error(t.syncFailed);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    const result = await syncNow();
    setIsSyncing(false);

    if (result.ok) {
      setLastSyncAt(result.serverTime ?? Date.now());
      toast.success(t.syncSuccess);
    } else {
      toast.error(t.syncFailed);
    }
  };

  const handleToggle = async (checked: boolean) => {
    setEnabled(checked);
    setCloudSyncEnabled(checked);

    if (checked) {
      if (!syncKey) {
        const generated = generateCloudSyncKey();
        setCloudSyncKey(generated);
        setSyncKeyState(getCloudSyncKey() ?? '');
      }
      await handleSync();
    }
  };

  const handleLinkKey = async () => {
    if (!linkKeyInput.trim()) return;
    if (linkKeyInput.replace(/[^A-Za-z0-9]/g, '').length < 12) {
      toast.error(t.invalidKey);
      return;
    }

    setCloudSyncKey(linkKeyInput);
    setSyncKeyState(getCloudSyncKey() ?? '');
    setLinkKeyInput('');
    setCloudSyncEnabled(true);
    setEnabled(true);
    await handleSync();
  };

  return (
    <Card className="panel-glass border-cyber-glow/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Cloud className="h-5 w-5 text-cyber-sigil" />
          {t.title}
        </CardTitle>
        <CardDescription>{t.desc}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm">{t.enable}</span>
          <Switch checked={enabled} onCheckedChange={handleToggle} />
        </div>

        {enabled && (
          <>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <KeyRound className="h-4 w-4 text-cyber-sigil" />
                {t.keyLabel}
              </div>
              <div className="flex gap-2">
                <Input value={formattedKey} readOnly />
                <Button variant="outline" onClick={handleCopy} className="gap-2">
                  <Copy className="h-4 w-4" />
                  {t.copy}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{t.keyHint}</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <LinkIcon className="h-4 w-4 text-cyber-sigil" />
                {t.linkTitle}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder={t.linkPlaceholder}
                  value={linkKeyInput}
                  onChange={(event) => setLinkKeyInput(event.target.value)}
                />
                <Button variant="outline" onClick={handleLinkKey}>
                  {t.linkButton}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{t.linkHint}</p>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border/50 bg-background/50 px-3 py-2">
              <div className="text-xs text-muted-foreground">
                {t.lastSync}: <span className="text-foreground">{lastSyncText}</span>
              </div>
              <Button size="sm" onClick={handleSync} disabled={isSyncing} className="gap-2">
                <RefreshCw className={isSyncing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
                {isSyncing ? t.syncing : t.syncNow}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
