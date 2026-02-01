import { useState, useRef, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { isEtherealSessionValid, getEtherealSession } from '@/lib/etherealTokenService';
import { EtherealHeader } from '@/components/ethereal/EtherealHeader';
import { useEtherealRealtime } from '@/hooks/useEtherealRealtime';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

export default function EtherealChat() {
  if (!isEtherealSessionValid()) {
    return <Navigate to="/e/home" replace />;
  }

  const session = getEtherealSession();
  const { messages, typingMembers, sendTyping, sendMessage, isConnected } = useEtherealRealtime();
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
    sendTyping();
  };

  const handleSend = async () => {
    if (!input.trim() || isSending) return;

    setIsSending(true);
    const content = input.trim();
    setInput('');

    await sendMessage(content);
    setIsSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-screen">
      <EtherealHeader title="Chat" />

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center text-muted-foreground py-12">
            <p>No messages yet. Say hello!</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isOwn = msg.senderId === session?.memberId;
            return (
              <div
                key={msg.serverId || msg.id}
                className={cn('flex flex-col max-w-[80%]', isOwn ? 'ml-auto items-end' : 'items-start')}
              >
                {!isOwn && (
                  <span className="text-xs text-muted-foreground mb-1">{msg.senderName}</span>
                )}
                <div
                  className={cn(
                    'px-4 py-2 rounded-2xl',
                    isOwn
                      ? 'bg-primary text-primary-foreground rounded-br-md'
                      : 'bg-muted rounded-bl-md'
                  )}
                >
                  <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                </div>
                <span className="text-[10px] text-muted-foreground mt-1">
                  {format(new Date(msg.createdAtMs), 'HH:mm')}
                </span>
              </div>
            );
          })
        )}

        {/* Typing indicator */}
        {typingMembers.length > 0 && (
          <div className="text-xs text-muted-foreground animate-pulse">
            {typingMembers.length === 1
              ? 'Someone is typing...'
              : `${typingMembers.length} people are typing...`}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="sticky bottom-16 bg-background border-t border-border p-3">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={isConnected ? 'Type a message...' : 'Connecting...'}
            disabled={!isConnected || isSending}
            className="flex-1"
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || !isConnected || isSending}
            size="icon"
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
