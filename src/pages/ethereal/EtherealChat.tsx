import { useState, useRef, useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { isEtherealSessionValid, getEtherealSession } from '@/lib/etherealTokenService';
import { EtherealHeader } from '@/components/ethereal/EtherealHeader';
import { EtherealMediaButton } from '@/components/ethereal/EtherealMediaButton';
import { useEtherealRealtime } from '@/hooks/useEtherealRealtime';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useI18n, getBaseLanguage } from '@/lib/i18n';

const texts = {
  bar: { ru: 'Бар', en: 'Bar' },
  chat: { ru: 'Чат', en: 'Chat' },
  emptyChat: { ru: 'Ещё никто ничего не сказал. Начните разговор!', en: 'No messages yet. Start the conversation!' },
  typingOne: { ru: 'Кто-то наливает...', en: 'Someone is typing...' },
  typingMany: { ru: ' человек наливают...', en: ' people are typing...' },
  placeholder: { ru: 'Шепнуть в бар...', en: 'Whisper to the bar...' },
  inPort: { ru: 'В порту...', en: 'In port...' },
  kicked: { ru: 'Вас удалили из комнаты', en: 'You have been removed from the room' },
  sessionExpired: { ru: 'Сессия истекла', en: 'Session expired' },
} as const;

export default function EtherealChat() {
  const navigate = useNavigate();
  const { language } = useI18n();
  const lang = getBaseLanguage(language);
  const t = (key: keyof typeof texts) => texts[key][lang];

  // 1. ALL HOOKS MUST BE CALLED FIRST - before any conditional returns
  const { messages, typingMembers, sendTyping, sendMessage, isConnected } = useEtherealRealtime();
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [pendingImage, setPendingImage] = useState<{
    blob: Blob;
    preview: string;
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Handle kicked/expired events
  useEffect(() => {
    const handleKicked = () => {
      toast.error(t('kicked'));
      navigate('/');
    };

    const handleExpired = () => {
      toast.error(t('sessionExpired'));
      navigate('/');
    };

    window.addEventListener('ethereal-kicked', handleKicked);
    window.addEventListener('ethereal-session-expired', handleExpired);

    return () => {
      window.removeEventListener('ethereal-kicked', handleKicked);
      window.removeEventListener('ethereal-session-expired', handleExpired);
    };
  }, [navigate, lang]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handler functions
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
    sendTyping();
  };

  const handleImageSelect = (blob: Blob) => {
    const preview = URL.createObjectURL(blob);
    setPendingImage({ blob, preview });
  };

  const clearPendingImage = () => {
    if (pendingImage) {
      URL.revokeObjectURL(pendingImage.preview);
      setPendingImage(null);
    }
  };

  const handleSend = async () => {
    if (!input.trim() && !pendingImage) return;
    if (isSending) return;

    setIsSending(true);
    const content = input.trim();
    setInput('');

    await sendMessage(content, pendingImage?.blob);
    
    clearPendingImage();
    setIsSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // 2. CONDITIONAL RETURN AFTER ALL HOOKS
  if (!isEtherealSessionValid()) {
    return <Navigate to="/e/home" replace />;
  }

  // Get session only after validation
  const session = getEtherealSession();

  return (
    <div className="flex flex-col h-screen yacht-gradient">
      <EtherealHeader title={t('bar')} subtitle={t('chat')} isConnected={isConnected} />

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center text-muted-foreground py-12">
            <p>{t('emptyChat')}</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isOwn = msg.senderId === session?.memberId;
            return (
              <div
                key={msg.serverId}
                className={cn('flex flex-col max-w-[80%]', isOwn ? 'ml-auto items-end' : 'items-start')}
              >
                {!isOwn && (
                  <span className="text-xs text-muted-foreground mb-1">{msg.senderName}</span>
                )}
                <div
                  className={cn(
                    'px-4 py-2 rounded-2xl',
                    isOwn
                      ? 'msg-outgoing rounded-br-md'
                      : 'msg-incoming rounded-bl-md'
                  )}
                >
                  {/* Image (if present) */}
                  {msg.imageUrl && (
                    <img
                      src={msg.imageUrl}
                      alt=""
                      className="max-w-[200px] max-h-[200px] rounded-lg cursor-pointer mb-2"
                      onClick={() => window.open(msg.imageUrl, '_blank')}
                    />
                  )}
                  {/* Text (only if not empty) */}
                  {msg.content && (
                    <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground mt-1">
                  <span dir="ltr">{format(new Date(msg.createdAtMs), 'HH:mm')}</span>
                </span>
              </div>
            );
          })
        )}

        {/* Typing indicator */}
        {typingMembers.length > 0 && (
          <div className="text-xs text-muted-foreground animate-pulse">
            {typingMembers.length === 1
              ? t('typingOne')
              : `${typingMembers.length}${t('typingMany')}`}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="sticky bottom-16 bg-card border-t border-border p-3">
        {/* Pending image preview */}
        {pendingImage && (
          <div className="mb-2 relative inline-block">
            <img
              src={pendingImage.preview}
              alt="Preview"
              className="w-20 h-20 object-cover rounded-lg"
            />
            <button
              onClick={clearPendingImage}
              className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
        
        <div className="flex rtl:flex-row-reverse gap-2">
          <EtherealMediaButton
            onImageSelect={handleImageSelect}
            disabled={!isConnected || isSending}
          />
          <Input
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={isConnected ? t('placeholder') : t('inPort')}
            disabled={!isConnected || isSending}
            className="flex-1"
          />
          <Button
            onClick={handleSend}
            disabled={(!input.trim() && !pendingImage) || !isConnected || isSending}
            size="icon"
            className="bg-primary hover:bg-primary/90"
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
