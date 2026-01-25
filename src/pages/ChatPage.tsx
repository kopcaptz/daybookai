import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, User, Loader2, AlertCircle, Settings, Copy, ExternalLink, X, Image as ImageIcon, KeyRound } from 'lucide-react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { ru, enUS } from 'date-fns/locale';
import { loadAISettings } from '@/lib/aiConfig';
import { streamChatCompletion, ChatMessage, MessageContentPart } from '@/lib/aiService';
import { getBiography } from '@/lib/biographyService';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n';
import { SigilIcon, GrimoireIcon, SealGlyph } from '@/components/icons/SigilIcon';
import { ChatImageCapture } from '@/components/chat/ChatImageCapture';
import { ChatImageConsent } from '@/components/chat/ChatImageConsent';
import { DiaryImagePicker } from '@/components/chat/DiaryImagePicker';
import { useAIAccess } from '@/hooks/useAIAccess';
import { AIPinDialog } from '@/components/AIPinDialog';

interface ConfirmedImage {
  blob: Blob;
  base64DataUrl: string;
}

interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  imageUrl?: string;
  imageUrls?: string[]; // Multiple images support
  isStreaming?: boolean;
  isBiography?: boolean;
  biographyDate?: string;
}

function ChatContent() {
  const { t, language } = useI18n();
  const locale = language === 'ru' ? ru : enUS;
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [settings, setSettings] = useState(() => loadAISettings());
  const [loadedBioDate, setLoadedBioDate] = useState<string | null>(null);
  
  // Image attachment state - now supports multiple
  const [pendingImages, setPendingImages] = useState<ConfirmedImage[]>([]);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [confirmedImages, setConfirmedImages] = useState<ConfirmedImage[]>([]);
  const [showDiaryPicker, setShowDiaryPicker] = useState(false);
  
  // AI Access (PIN gate)
  const aiAccess = useAIAccess(language);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reload settings when page is focused
  useEffect(() => {
    const handleFocus = () => setSettings(loadAISettings());
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  // Handle deep link for biography
  useEffect(() => {
    const bioDate = searchParams.get('bio');
    if (bioDate && bioDate !== loadedBioDate) {
      setLoadedBioDate(bioDate);
      
      getBiography(bioDate).then((bio) => {
        if (bio?.status === 'complete' && bio.biography) {
          const formattedDate = format(parseISO(bioDate), 'd MMMM yyyy', { locale });
          const content = `**${bio.biography.title}**\n\n${bio.biography.narrative}\n\n` +
            (bio.biography.highlights.length > 0 
              ? `**${t('misc.highlights')}:**\n${bio.biography.highlights.map(h => `• ${h}`).join('\n')}`
              : '');
          
          const bioMessage: DisplayMessage = {
            id: `bio-${bioDate}`,
            role: 'assistant',
            content,
            isBiography: true,
            biographyDate: bioDate,
          };
          
          setMessages(prev => {
            if (prev.some(m => m.id === bioMessage.id)) return prev;
            return [bioMessage, ...prev];
          });
        }
      });
      
      setSearchParams({});
    }
  }, [searchParams, loadedBioDate, locale, language, setSearchParams, t]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Handle single image ready (from camera/gallery)
  const handleImageReady = (result: ConfirmedImage) => {
    if (settings.strictPrivacy) {
      toast.error(language === 'ru' 
        ? 'Строгая приватность — отправка изображений отключена.' 
        : 'Strict privacy — image sending disabled.');
      return;
    }
    
    setPendingImages([result]);
    setShowConsentModal(true);
  };

  // Handle multiple images ready (from diary picker)
  const handleMultiImageReady = (results: ConfirmedImage[]) => {
    if (settings.strictPrivacy) {
      toast.error(language === 'ru' 
        ? 'Строгая приватность — отправка изображений отключена.' 
        : 'Strict privacy — image sending disabled.');
      return;
    }
    
    setPendingImages(results);
    setShowConsentModal(true);
  };

  const handleConsentConfirm = () => {
    if (pendingImages.length > 0) {
      setConfirmedImages(prev => [...prev, ...pendingImages]);
    }
    setPendingImages([]);
    setShowConsentModal(false);
  };

  const handleConsentCancel = () => {
    setPendingImages([]);
    setShowConsentModal(false);
  };

  const removeConfirmedImage = (index: number) => {
    setConfirmedImages(prev => prev.filter((_, i) => i !== index));
  };

  const clearAllConfirmedImages = () => {
    setConfirmedImages([]);
  };

  const handleSend = async () => {
    const trimmedInput = input.trim();
    if ((!trimmedInput && confirmedImages.length === 0) || isLoading) return;

    if (!settings.enabled) {
      toast.error(t('ai.chatDisabled'));
      return;
    }

    // Build display message for user
    const userDisplayMessage: DisplayMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmedInput || (language === 'ru' ? '[Фото]' : '[Photo]'),
      imageUrls: confirmedImages.length > 0 ? confirmedImages.map(img => img.base64DataUrl) : undefined,
    };

    const assistantMessage: DisplayMessage = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: '',
      isStreaming: true,
    };

    setMessages(prev => [...prev, userDisplayMessage, assistantMessage]);
    setInput('');
    const imagesToSend = [...confirmedImages];
    setConfirmedImages([]);
    setIsLoading(true);

    // Build API messages
    const apiMessages: ChatMessage[] = messages.map(m => {
      if ((m.imageUrl || m.imageUrls) && m.role === 'user') {
        const parts: MessageContentPart[] = [];
        if (m.content && m.content !== '[Фото]' && m.content !== '[Photo]') {
          parts.push({ type: 'text', text: m.content });
        }
        // Handle both single and multiple images
        const urls = m.imageUrls ?? (m.imageUrl ? [m.imageUrl] : []);
        urls.forEach(url => {
          parts.push({ type: 'image_url', image_url: { url } });
        });
        return { role: 'user' as const, content: parts };
      }
      return { role: m.role as 'user' | 'assistant', content: m.content };
    });

    // Add current message
    if (imagesToSend.length > 0) {
      const parts: MessageContentPart[] = [];
      if (trimmedInput) {
        parts.push({ type: 'text', text: trimmedInput });
      }
      imagesToSend.forEach(img => {
        parts.push({ type: 'image_url', image_url: { url: img.base64DataUrl } });
      });
      apiMessages.push({ role: 'user' as const, content: parts });
    } else {
      apiMessages.push({ role: 'user' as const, content: trimmedInput });
    }

    await streamChatCompletion(
      apiMessages,
      settings.chatProfile,
      {
        onToken: (token) => {
          setMessages(prev => {
            const newMessages = [...prev];
            const lastMessage = newMessages[newMessages.length - 1];
            if (lastMessage && lastMessage.role === 'assistant') {
              lastMessage.content += token;
            }
            return newMessages;
          });
        },
        onComplete: () => {
          setMessages(prev => {
            const newMessages = [...prev];
            const lastMessage = newMessages[newMessages.length - 1];
            if (lastMessage) {
              lastMessage.isStreaming = false;
            }
            return newMessages;
          });
          setIsLoading(false);
        },
        onError: (error) => {
          toast.error(error.message);
          setMessages(prev => {
            const newMessages = [...prev];
            const lastMessage = newMessages[newMessages.length - 1];
            if (lastMessage && lastMessage.role === 'assistant') {
              lastMessage.content = t('common.error');
              lastMessage.isStreaming = false;
            }
            return newMessages;
          });
          setIsLoading(false);
        },
      }
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Show PIN gate if AI enabled but no valid token
  if (!aiAccess.hasValidToken) {
    return (
      <div className="flex min-h-screen flex-col pb-24 cyber-noise rune-grid">
        <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl px-4 py-6 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="relative">
              <SigilIcon className="h-6 w-6 text-cyber-sigil" />
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
        </header>

        <main className="flex flex-1 items-center justify-center px-4">
          <div className="flex flex-col items-center text-center">
            <div className="mb-6 p-8 panel-glass relative">
              <KeyRound className="h-12 w-12 text-amber-500" />
              <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-cyber-sigil/50 animate-sigil-pulse" />
            </div>
            
            <h3 className="mb-2 text-xl font-serif font-medium">{t('aiPin.required')}</h3>
            <p className="mb-6 max-w-xs text-sm text-muted-foreground">
              {t('aiPin.requiredHint')}
            </p>

            <Button onClick={aiAccess.openPinDialog} className="gap-2 btn-cyber">
              <KeyRound className="h-4 w-4" />
              {t('aiPin.enter')}
            </Button>
          </div>
        </main>
        
        <AIPinDialog
          open={aiAccess.showPinDialog}
          onOpenChange={aiAccess.closePinDialog}
          onVerify={aiAccess.verifyPin}
          isVerifying={aiAccess.isVerifying}
          language={language}
        />
      </div>
    );
  }

  if (!settings.enabled) {
    return (
      <div className="flex min-h-screen flex-col pb-24 cyber-noise rune-grid">
        <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl px-4 py-6 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="relative">
              <SigilIcon className="h-6 w-6 text-cyber-sigil" />
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
        </header>

        <main className="flex flex-1 items-center justify-center px-4">
          <div className="flex flex-col items-center text-center">
            <div className="mb-6 p-8 panel-glass relative">
              <AlertCircle className="h-12 w-12 text-muted-foreground" />
              <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-cyber-sigil/50 animate-sigil-pulse" />
            </div>
            
            <h3 className="mb-2 text-xl font-serif font-medium">{t('ai.chatDisabled')}</h3>
            <p className="mb-6 max-w-xs text-sm text-muted-foreground">
              {t('ai.chatDisabledHint')}
            </p>

            <Link to="/settings">
              <Button className="gap-2 btn-cyber">
                <Settings className="h-4 w-4" />
                {t('common.settings')}
              </Button>
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col pb-24 cyber-noise rune-grid">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl px-4 py-4 border-b border-border/50">
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyber-glow/30 to-transparent" />
        
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <SigilIcon className="h-6 w-6 text-cyber-sigil" animated />
              <div className="absolute -bottom-1 -right-1 w-2 h-2 rounded-full bg-cyber-glow animate-pulse-glow" />
            </div>
            <div>
              <h1 className="text-xl font-serif font-medium text-foreground tracking-wide">
                {t('app.name')}
              </h1>
              <p className="text-xs text-muted-foreground/80 tracking-widest">
                {t('ai.profile')}: {t(`ai.profile.${settings.chatProfile}` as any)}
              </p>
            </div>
          </div>
          <Link to="/settings">
            <Button variant="ghost" size="icon" className="hover:bg-cyber-glow/10">
              <Settings className="h-5 w-5" />
            </Button>
          </Link>
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-4 p-6 panel-glass relative">
              <GrimoireIcon className="h-10 w-10 text-cyber-sigil" />
              <div className="absolute top-2 right-2 text-cyber-sigil/40">
                <SealGlyph size={10} />
              </div>
            </div>
            <h3 className="mb-2 font-serif font-medium text-lg">
              {t('ai.startConversation')}
            </h3>
            <p className="max-w-xs text-sm text-muted-foreground leading-relaxed">
              {t('ai.startConversationHint')}
            </p>
            <p className="mt-2 max-w-xs text-xs text-muted-foreground/60">
              {language === 'ru' 
                ? 'Можно отправить до 4 фото' 
                : 'You can send up to 4 photos'}
            </p>
            <div className="mt-4 flex items-center gap-3 text-cyber-sigil/30">
              <SealGlyph size={10} />
              <div className="w-12 h-px bg-gradient-to-r from-transparent via-cyber-glow/30 to-transparent" />
              <SealGlyph size={10} />
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                'flex gap-3 animate-fade-in',
                message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
              )}
            >
              <div
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                  message.role === 'user' 
                    ? 'bg-primary' 
                    : 'panel-glass border border-cyber-glow/20'
                )}
              >
                {message.role === 'user' ? (
                  <User className="h-4 w-4 text-primary-foreground" />
                ) : (
                  <SigilIcon className="h-4 w-4 text-cyber-sigil" />
                )}
              </div>
              
              <div
                className={cn(
                  'max-w-[80%] rounded-lg px-4 py-3',
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-tr-sm'
                    : 'panel-glass rounded-tl-sm',
                  message.isBiography && 'bg-gradient-to-br from-cyber-glow/5 to-cyber-glow-secondary/5 border-cyber-glow/20'
                )}
              >
                {/* User images preview - supports multiple */}
                {(message.imageUrl || message.imageUrls) && (
                  <div className={`mb-2 rounded overflow-hidden ${
                    (message.imageUrls?.length ?? 1) > 1 
                      ? 'grid grid-cols-2 gap-1' 
                      : 'max-w-48'
                  }`}>
                    {(message.imageUrls ?? (message.imageUrl ? [message.imageUrl] : [])).map((url, idx) => (
                      <img 
                        key={idx}
                        src={url} 
                        alt={`Attached ${idx + 1}`}
                        className={`object-cover ${
                          (message.imageUrls?.length ?? 1) > 1 
                            ? 'w-full aspect-square rounded' 
                            : 'w-full h-auto max-h-32'
                        }`}
                      />
                    ))}
                  </div>
                )}
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {message.content || (message.isStreaming ? '...' : '')}
                </p>
                {message.isStreaming && (
                  <span className="mt-1 inline-block h-4 w-1 animate-pulse bg-cyber-sigil" />
                )}
                
                {/* Biography actions */}
                {message.isBiography && message.biographyDate && (
                  <div className="mt-3 flex gap-2 border-t border-border/50 pt-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1 h-7 text-xs hover:bg-cyber-glow/10"
                      onClick={() => {
                        navigator.clipboard.writeText(message.content);
                        toast.success(t('misc.copied'));
                      }}
                    >
                      <Copy className="h-3 w-3" />
                      {t('misc.copy')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1 h-7 text-xs hover:bg-cyber-glow/10"
                      onClick={() => navigate(`/day/${message.biographyDate}`)}
                    >
                      <ExternalLink className="h-3 w-3" />
                      {t('misc.openDay')}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </main>

      {/* Input */}
      <div className="sticky bottom-16 border-t border-border/60 bg-background/90 backdrop-blur-xl p-4 safe-bottom">
        {/* Attached images preview - multiple support */}
        {confirmedImages.length > 0 && (
          <div className="mb-2 flex flex-wrap items-start gap-2 p-2 rounded-lg bg-muted/30 border border-border/50">
            {confirmedImages.map((img, idx) => (
              <div key={idx} className="relative">
                <img 
                  src={img.base64DataUrl} 
                  alt={`To send ${idx + 1}`}
                  className="h-14 w-14 object-cover rounded"
                />
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full"
                  onClick={() => removeConfirmedImage(idx)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
            <div className="flex-1 flex items-center min-w-[100px]">
              <span className="text-xs text-muted-foreground">
                {confirmedImages.length} {language === 'ru' 
                  ? (confirmedImages.length === 1 ? 'фото' : 'фото') 
                  : (confirmedImages.length === 1 ? 'photo' : 'photos')}
              </span>
              {confirmedImages.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-2 h-6 px-2 text-xs"
                  onClick={clearAllConfirmedImages}
                >
                  {language === 'ru' ? 'Очистить' : 'Clear'}
                </Button>
              )}
            </div>
          </div>
        )}

        <div className="flex gap-2 items-end">
          {/* Image capture buttons */}
          {!settings.strictPrivacy && (
            <ChatImageCapture 
              onImageReady={handleImageReady}
              onDiaryPickerOpen={() => setShowDiaryPicker(true)}
              disabled={isLoading}
            />
          )}
          
          <div className="flex-1 panel-glass p-1 border border-border/40">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('ai.chatPlaceholder')}
              className="min-h-[44px] max-h-32 resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/70"
              disabled={isLoading}
            />
          </div>
          <Button
            onClick={handleSend}
            disabled={(!input.trim() && confirmedImages.length === 0) || isLoading}
            size="icon"
            className="shrink-0 h-12 w-12 rounded-lg btn-cyber p-0"
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </Button>
        </div>
      </div>

      {/* Image consent modal - supports multiple */}
      <ChatImageConsent
        open={showConsentModal}
        onConfirm={handleConsentConfirm}
        onCancel={handleConsentCancel}
        imagePreviewUrls={pendingImages.map(img => img.base64DataUrl)}
      />

      {/* Diary image picker with multi-select */}
      <DiaryImagePicker
        open={showDiaryPicker}
        onOpenChange={setShowDiaryPicker}
        onImageSelect={handleImageReady}
        onMultiImageSelect={handleMultiImageReady}
      />
    </div>
  );
}

export default function ChatPage() {
  return (
    <ErrorBoundary>
      <ChatContent />
    </ErrorBoundary>
  );
}
