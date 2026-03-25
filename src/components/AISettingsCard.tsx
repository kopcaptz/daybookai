import { useState, useEffect } from 'react';
import { Zap, Gauge, Wifi, WifiOff, Shield, ShieldCheck, KeyRound, Clock, Brain, Tags, Camera, Globe, Server, Eye, EyeOff, ExternalLink, AlertTriangle } from 'lucide-react';
import { 
  AIProfile,
  AIProvider,
  AISettings, 
  DEFAULT_AI_SETTINGS,
  AI_PROVIDERS,
  PROVIDER_MODELS,
  loadAISettings, 
  saveAISettings,
} from '@/lib/aiConfig';
import { testAIConnection } from '@/lib/aiService';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n';
import { SigilIcon, SealIcon } from '@/components/icons/SigilIcon';
import { useAIAccess } from '@/hooks/useAIAccess';
import { AIPinDialog } from '@/components/AIPinDialog';

const PROFILE_ICONS: Record<AIProfile, React.ElementType> = {
  economy: Zap,
  fast: Zap,
  balanced: Gauge,
  quality: SigilIcon,
  biography: SealIcon,
};

const PROVIDER_ICONS: Record<AIProvider, React.ElementType> = {
  lovable: Server,
  openrouter: Globe,
  minimax: Zap,
};

interface AISettingsCardProps {
  onSettingsChange?: (settings: AISettings) => void;
}

export function AISettingsCard({ onSettingsChange }: AISettingsCardProps) {
  const { t, language } = useI18n();
  const [settings, setSettings] = useState<AISettings>(DEFAULT_AI_SETTINGS);
  const [isTesting, setIsTesting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'unknown' | 'success' | 'error'>('unknown');
  const [showApiKey, setShowApiKey] = useState(false);
  const {
    hasValidToken,
    tokenExpiryFormatted,
    showPinDialog,
    openPinDialog,
    closePinDialog,
    verifyPin,
    isVerifying,
    revokeAccess,
  } = useAIAccess(language);

  useEffect(() => {
    const loadedSettings = loadAISettings();
    setSettings(loadedSettings);
  }, []);

  const updateSettings = (updates: Partial<AISettings>) => {
    const newSettings = { ...settings, ...updates };
    setSettings(newSettings);
    saveAISettings(newSettings);
    onSettingsChange?.(newSettings);
    setConnectionStatus('unknown');
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setConnectionStatus('unknown');
    
    try {
      const result = await testAIConnection();
      setConnectionStatus(result.success ? 'success' : 'error');
      
      if (result.success) {
        toast.success(language === 'ru' ? 'Соединение установлено!' : 'Connection established!');
      } else {
        toast.error(result.message);
      }
    } catch {
      setConnectionStatus('error');
      toast.error(language === 'ru' ? 'Ошибка проверки соединения' : 'Connection test failed');
    } finally {
      setIsTesting(false);
    }
  };

  const getProfileName = (profileId: AIProfile): string => {
    const key = `ai.profile.${profileId}` as const;
    return t(key as any);
  };

  const chatProfiles: AIProfile[] = ['economy', 'fast', 'balanced', 'quality'];
  const bioProfiles: AIProfile[] = ['balanced', 'quality', 'biography'];

  return (
    <Card className="panel-glass border-cyber-glow/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <SigilIcon className="h-5 w-5 text-cyber-sigil" />
          {t('ai.title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* PIN Access Gate */}
        {!hasValidToken && (
          <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 space-y-3">
            <div className="flex items-center gap-3">
              <KeyRound className="h-5 w-5 text-amber-500" />
              <div>
                <p className="text-sm font-medium">{t('aiPin.required')}</p>
                <p className="text-xs text-muted-foreground">{t('aiPin.requiredHint')}</p>
              </div>
            </div>
            <Button 
              onClick={openPinDialog} 
              className="w-full gap-2 btn-cyber"
              size="sm"
            >
              <KeyRound className="h-4 w-4" />
              {t('aiPin.enter')}
            </Button>
          </div>
        )}
        
        {/* Token Status (when valid) */}
        {hasValidToken && (
          <div className="flex items-center justify-between p-3 rounded-lg bg-cyber-glow/5 border border-cyber-glow/20">
            <div className="flex items-center gap-3">
              <Clock className="h-4 w-4 text-cyber-sigil" />
              <div>
                <p className="text-xs text-muted-foreground">{t('aiPin.expiresIn')}</p>
                <p className="text-sm font-medium">{tokenExpiryFormatted}</p>
              </div>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={revokeAccess}
              className="text-xs text-muted-foreground hover:text-destructive"
            >
              {t('aiPin.revoke')}
            </Button>
          </div>
        )}
        
        {/* AI Enabled Toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <SigilIcon className="h-5 w-5 text-muted-foreground" />
            <div>
              <Label htmlFor="ai-enabled" className="text-sm font-medium">
                {settings.enabled ? t('ai.enabled') : t('ai.disabled')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t('ai.cloudService')}
              </p>
            </div>
          </div>
          <Switch
            id="ai-enabled"
            checked={settings.enabled}
            onCheckedChange={(checked) => updateSettings({ enabled: checked })}
            disabled={!hasValidToken}
          />
        </div>

        {/* Strict Privacy Toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {settings.strictPrivacy ? (
              <ShieldCheck className="h-5 w-5 text-cyber-sigil" />
            ) : (
              <Shield className="h-5 w-5 text-muted-foreground" />
            )}
            <div>
              <Label htmlFor="strict-privacy" className="text-sm font-medium">
                {t('ai.strictPrivacy')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t('ai.strictPrivacyHint')}
              </p>
            </div>
          </div>
          <Switch
            id="strict-privacy"
            checked={settings.strictPrivacy}
            onCheckedChange={(checked) => updateSettings({ strictPrivacy: checked })}
          />
        </div>

        {/* Auto-Mood / Mood Sensor */}
        <Collapsible>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Brain className={cn(
                "h-5 w-5",
                settings.autoMood ? "text-cyber-sigil" : "text-muted-foreground"
              )} />
              <div>
                <Label htmlFor="auto-mood" className="text-sm font-medium">
                  {t('mood.autoTitle')}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t('mood.autoHint')}
                </p>
              </div>
            </div>
            <Switch
              id="auto-mood"
              checked={settings.autoMood}
              onCheckedChange={(checked) => updateSettings({ autoMood: checked })}
            />
          </div>
          
          {/* Sub-settings for auto-mood */}
          {settings.autoMood && (
            <CollapsibleContent className="pl-8 mt-3 space-y-3 border-l-2 border-cyber-glow/20 ml-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="live-suggestions" className="text-sm">
                    {t('mood.liveSuggestions')}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t('mood.liveSuggestionsHint')}
                  </p>
                </div>
                <Switch
                  id="live-suggestions"
                  checked={settings.autoMoodLiveSuggestions}
                  onCheckedChange={(checked) => updateSettings({ autoMoodLiveSuggestions: checked })}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="inherit-chat" className="text-sm">
                    {t('mood.inheritFromChat')}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t('mood.inheritFromChatHint')}
                  </p>
                </div>
                <Switch
                  id="inherit-chat"
                  checked={settings.autoMoodInheritFromChat}
                  onCheckedChange={(checked) => updateSettings({ autoMoodInheritFromChat: checked })}
                />
              </div>
            </CollapsibleContent>
          )}
        </Collapsible>

        {/* Auto-Tags Toggle */}
        <Collapsible open={settings.autoTags}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Tags className="h-5 w-5 text-cyber-glow" />
              <div>
                <Label htmlFor="auto-tags" className="text-sm font-medium">
                  {t('tags.autoTitle')}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t('tags.autoHint')}
                </p>
              </div>
            </div>
            <Switch
              id="auto-tags"
              checked={settings.autoTags}
              onCheckedChange={(checked) => updateSettings({ autoTags: checked })}
            />
          </div>
        </Collapsible>

        {/* Auto-Screenshot Toggle */}
        <Collapsible open={settings.autoScreenshot}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Camera className={cn(
                "h-5 w-5",
                settings.autoScreenshot ? "text-cyber-sigil" : "text-muted-foreground"
              )} />
              <div>
                <Label htmlFor="auto-screenshot" className="text-sm font-medium">
                  {t('autoScreenshot.title')}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t('autoScreenshot.description')}
                </p>
              </div>
            </div>
            <Switch
              id="auto-screenshot"
              checked={settings.autoScreenshot}
              onCheckedChange={(checked) => updateSettings({ autoScreenshot: checked })}
            />
          </div>
          
          {/* Sub-settings for auto-screenshot */}
          {settings.autoScreenshot && (
            <CollapsibleContent className="pl-8 mt-3 space-y-3 border-l-2 border-cyber-glow/20 ml-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="blur-private" className="text-sm">
                    {t('autoScreenshot.blurPrivate')}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t('autoScreenshot.blurPrivateHint')}
                  </p>
                </div>
                <Switch
                  id="blur-private"
                  checked={settings.autoScreenshotBlurPrivate}
                  onCheckedChange={(checked) => updateSettings({ autoScreenshotBlurPrivate: checked })}
                />
              </div>
            </CollapsibleContent>
          )}
        </Collapsible>

        {/* Provider Selection */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">{t('ai.provider' as any)}</Label>
          <div className="grid grid-cols-3 gap-2">
            {(['lovable', 'openrouter', 'minimax'] as AIProvider[]).map((providerId) => {
              const ProviderIcon = PROVIDER_ICONS[providerId];
              const isSelected = settings.provider === providerId;
              const providerInfo = AI_PROVIDERS[providerId];
              const lang = language === 'ru' ? 'ru' : 'en';
              
              return (
                <Button
                  key={providerId}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => updateSettings({ provider: providerId })}
                  className={cn(
                    'flex-col h-auto py-2 gap-1 profile-btn-cyber text-xs',
                    isSelected && 'active'
                  )}
                  disabled={!settings.enabled || !hasValidToken}
                >
                  <ProviderIcon className="h-4 w-4" />
                  <span className="font-medium">{providerInfo.name}</span>
                  <span className="text-[10px] text-muted-foreground leading-tight">{providerInfo.description[lang]}</span>
                </Button>
              );
            })}
          </div>
          {/* Show current model for selected profile+provider */}
          <p className="text-xs text-muted-foreground mt-1">
            {t('ai.currentModel' as any)}: <span className="font-mono text-cyber-glow">{PROVIDER_MODELS[settings.provider]?.[settings.chatProfile] || '—'}</span>
          </p>

          {/* API Key Input for OpenRouter / MiniMax */}
          {settings.provider !== 'lovable' && (
            <div className="mt-3 space-y-2 p-3 rounded-lg bg-muted/30 border border-border">
              <Label className="text-sm flex items-center gap-2">
                <KeyRound className="h-3.5 w-3.5" />
                {language === 'ru' ? 'API ключ' : 'API Key'} {AI_PROVIDERS[settings.provider].name}
              </Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    type={showApiKey ? 'text' : 'password'}
                    placeholder={language === 'ru' ? 'Вставьте ваш API ключ...' : 'Paste your API key...'}
                    value={settings.provider === 'openrouter' ? settings.openrouterApiKey : settings.minimaxApiKey}
                    onChange={(e) => {
                      const key = settings.provider === 'openrouter' ? 'openrouterApiKey' : 'minimaxApiKey';
                      updateSettings({ [key]: e.target.value });
                    }}
                    className="pr-10 font-mono text-xs"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setShowApiKey(!showApiKey)}
                  >
                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              
              {/* Warning if key is empty */}
              {((settings.provider === 'openrouter' && !settings.openrouterApiKey) ||
                (settings.provider === 'minimax' && !settings.minimaxApiKey)) && (
                <div className="flex items-center gap-2 text-amber-500 text-xs">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {language === 'ru' ? 'Ключ не указан — провайдер не будет работать' : 'No key — provider will not work'}
                </div>
              )}

              {/* Link to get API key */}
              <a
                href={settings.provider === 'openrouter' ? 'https://openrouter.ai/keys' : 'https://platform.minimaxi.com'}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-cyber-glow hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                {language === 'ru' ? 'Где взять ключ?' : 'Where to get a key?'}
              </a>
            </div>
          )}
        </div>

        {/* Chat Profile Selection */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">{t('ai.chatProfile')}</Label>
          <div className="grid grid-cols-2 gap-2">
            {chatProfiles.map((profileId) => {
              const Icon = PROFILE_ICONS[profileId];
              const isSelected = settings.chatProfile === profileId;
              
              return (
                <Button
                  key={profileId}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => updateSettings({ chatProfile: profileId })}
                  className={cn(
                    'justify-start gap-2 profile-btn-cyber',
                    isSelected && 'active'
                  )}
                  disabled={!settings.enabled || !hasValidToken}
                >
                  <Icon className="h-4 w-4" />
                  {getProfileName(profileId)}
                </Button>
              );
            })}
          </div>
        </div>

        {/* Bio Profile Selection */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">{t('ai.bioProfile')}</Label>
          <div className="grid grid-cols-3 gap-2">
            {bioProfiles.map((profileId) => {
              const Icon = PROFILE_ICONS[profileId];
              const isSelected = settings.bioProfile === profileId;
              
              return (
                <Button
                  key={profileId}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => updateSettings({ bioProfile: profileId })}
                  className={cn(
                    'justify-start gap-2 text-xs profile-btn-cyber',
                    isSelected && 'active'
                  )}
                  disabled={!settings.enabled || !hasValidToken}
                >
                  <Icon className="h-3 w-3" />
                  <span className="truncate">{getProfileName(profileId)}</span>
                </Button>
              );
            })}
          </div>
        </div>

        {/* Test Connection Button */}
        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={handleTestConnection}
          disabled={isTesting || !hasValidToken}
        >
          {isTesting ? (
            <>
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              {t('common.loading')}
            </>
          ) : connectionStatus === 'success' ? (
            <>
              <Wifi className="h-4 w-4 text-cyber-sigil" />
              {t('ai.connectionSuccess')}
            </>
          ) : connectionStatus === 'error' ? (
            <>
              <WifiOff className="h-4 w-4 text-destructive" />
              {t('ai.connectionError')}
            </>
          ) : (
            <>
              <Wifi className="h-4 w-4" />
              {t('ai.testConnection')}
            </>
          )}
        </Button>
      </CardContent>
      
      {/* PIN Dialog */}
      <AIPinDialog
        open={showPinDialog}
        onOpenChange={closePinDialog}
        onVerify={verifyPin}
        isVerifying={isVerifying}
        language={language}
      />
    </Card>
  );
}
