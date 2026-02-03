import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, ArrowRight, FolderOpen, Send, Search, Loader2, User, Bot, AlertCircle } from 'lucide-react';
import { 
  getDiscussionSessionById, 
  getMessagesBySessionId, 
  addDiscussionMessage,
  updateDiscussionSession,
  DiscussionSession,
  DiscussionMessage,
  DiscussionMode
} from '@/lib/db';
import { buildContextPack, ContextPackResult } from '@/lib/librarian/contextPack';
import { sendDiscussionMessage, DiscussionAIResponse } from '@/lib/ai/discussions';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ModeSelector, ModePill } from '@/components/discussions/ModeSelector';
import { EvidenceList } from '@/components/discussions/EvidenceCard';
import { ContextDrawer } from '@/components/discussions/ContextDrawer';
import { DraftArtifact } from '@/components/discussions/DraftArtifact';
import { PlanArtifact } from '@/components/discussions/PlanArtifact';
import { AnalysisArtifact } from '@/components/discussions/AnalysisArtifact';
import { ComputeArtifact } from '@/components/discussions/ComputeArtifact';
import { FollowUpQuestions } from '@/components/discussions/FollowUpQuestions';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Toggle } from '@/components/ui/toggle';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useI18n, isRTL } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// Dynamic placeholders for each mode
const MODE_PLACEHOLDERS: Record<DiscussionMode, { ru: string; en: string }> = {
  discuss: { 
    ru: 'Что ты думаешь о...', 
    en: 'What do you think about...' 
  },
  analyze: { 
    ru: 'Проанализируй закономерности в...', 
    en: 'Analyze patterns in...' 
  },
  draft: { 
    ru: 'Напиши письмо о...', 
    en: 'Write an email about...' 
  },
  compute: { 
    ru: 'Посчитай сколько...', 
    en: 'Calculate how much...' 
  },
  plan: { 
    ru: 'Составь план для...', 
    en: 'Create a plan for...' 
  },
};

function DiscussionChatContent() {
  const { id } = useParams<{ id: string }>();
  const sessionId = parseInt(id || '0', 10);
  const navigate = useNavigate();
  const { t, language } = useI18n();
  
  const session = useLiveQuery(() => getDiscussionSessionById(sessionId), [sessionId]);
  const messages = useLiveQuery(() => getMessagesBySessionId(sessionId), [sessionId]);
  
  const [inputText, setInputText] = useState('');
  const [mode, setMode] = useState<DiscussionMode>('discuss');
  const [findMode, setFindMode] = useState(false);
  const [sending, setSending] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [currentEvidence, setCurrentEvidence] = useState<ContextPackResult | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Set initial mode from session
  useEffect(() => {
    if (session?.modeDefault) {
      setMode(session.modeDefault);
    }
  }, [session?.modeDefault]);
  
  // Auto-enable findMode when scope is empty
  useEffect(() => {
    if (session && 
        session.scope.entryIds.length === 0 && 
        session.scope.docIds.length === 0) {
      setFindMode(true);
    }
  }, [session?.scope.entryIds.length, session?.scope.docIds.length]);
  
  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
  }, [inputText]);
  
  const handleSend = async () => {
    if (!inputText.trim() || sending || !session) return;
    
    const userText = inputText.trim();
    setInputText('');
    setSending(true);
    
    try {
      // Save user message
      await addDiscussionMessage({
        sessionId,
        role: 'user',
        content: userText,
        status: 'ok',
        meta: { mode },
      });
      
      // Build context pack
      const contextPack = await buildContextPack({
        sessionScope: session.scope,
        userQuery: userText,
        mode,
        findMode,
      });
      setCurrentEvidence(contextPack);
      
      // Show warning if no context was found
      if (contextPack.evidence.length === 0) {
        toast.info(
          language === 'ru' 
            ? 'Записи не найдены. Попробуйте другой запрос или добавьте записи через "Контекст".'
            : 'No entries found. Try a different query or add entries via "Context".'
        );
      }
      // Call AI
      const response = await sendDiscussionMessage({
        sessionId,
        userText,
        mode,
        contextPack,
        history: messages || [],
        language: language as 'ru' | 'en',
      });
      
      // Filter evidence to used ones
      const usedEvidence = contextPack.evidence.filter(e => 
        response.usedEvidenceIds.includes(e.id)
      );
      
      // Save assistant message
      await addDiscussionMessage({
        sessionId,
        role: 'assistant',
        content: response.answer,
        evidenceRefs: usedEvidence,
        status: 'ok',
        meta: {
          mode,
          draftArtifact: response.draftArtifact,
          analysisArtifact: response.analysisArtifact,
          computeArtifact: response.computeArtifact,
          planArtifact: response.planArtifact,
          questions: response.questions,
        },
      });
      
      // Update session title if it's still default
      if (session.title === (language === 'ru' ? 'Новое обсуждение' : 'New discussion')) {
        const newTitle = userText.slice(0, 50) + (userText.length > 50 ? '...' : '');
        await updateDiscussionSession(sessionId, { title: newTitle });
      }
      
    } catch (error) {
      console.error('[DiscussionChat] Send failed:', error);
      toast.error(t('discussion.error'));
      
      // Save error message
      await addDiscussionMessage({
        sessionId,
        role: 'assistant',
        content: language === 'ru' 
          ? 'Произошла ошибка при обработке запроса. Попробуйте ещё раз.'
          : 'An error occurred while processing your request. Please try again.',
        status: 'error',
      });
    } finally {
      setSending(false);
    }
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };
  
  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  
  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="flex items-center gap-3 px-4 py-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/discussions')}
            className="shrink-0"
          >
            {isRTL(language) ? <ArrowRight className="h-5 w-5" /> : <ArrowLeft className="h-5 w-5" />}
          </Button>
          
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-medium truncate">{session.title}</h1>
            <p className="text-xs text-muted-foreground">
              {session.scope.entryIds.length} {language === 'ru' ? 'записей' : 'entries'}
            </p>
          </div>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => setContextOpen(true)}
            className="shrink-0 gap-1.5"
          >
            <FolderOpen className="h-4 w-4" />
            {t('discussion.context')}
          </Button>
        </div>
        
        {/* Mode selector */}
        <div className="px-4 pb-3">
          <ModeSelector value={mode} onChange={setMode} disabled={sending} />
        </div>
      </header>
      
      {/* Messages */}
      <ScrollArea className="flex-1 px-4 py-4">
        <div className="space-y-4 max-w-2xl mx-auto">
          {(!messages || messages.length === 0) && (
            <div className="text-center py-12 space-y-3">
              {session.scope.entryIds.length === 0 && session.scope.docIds.length === 0 ? (
                <>
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm">
                    <Search className="h-3.5 w-3.5" />
                    {language === 'ru' ? 'Режим «Найти в записях» активен' : 'Find in notes mode active'}
                  </div>
                  <p className="text-muted-foreground text-sm max-w-xs mx-auto">
                    {language === 'ru' 
                      ? 'AI будет искать релевантные записи автоматически. Или добавьте записи через кнопку «Контекст».'
                      : 'AI will search for relevant entries automatically. Or add entries via the Context button.'}
                  </p>
                </>
              ) : (
                <p className="text-muted-foreground">
                  {t('discussion.placeholder')}
                </p>
              )}
            </div>
          )}
          
          {messages?.map((message) => (
            <MessageBubble 
              key={message.id} 
              message={message} 
              language={language}
              onSelectQuestion={setInputText}
            />
          ))}
          
          {sending && (
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('discussion.sending')}
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>
      
      {/* Composer */}
      <div className="sticky bottom-0 bg-background/80 backdrop-blur-xl border-t border-border/50 p-4 safe-bottom">
        <div className="max-w-2xl mx-auto">
          {/* Find mode toggle */}
          <div className="flex items-center gap-2 mb-3">
            <Toggle
              pressed={findMode}
              onPressedChange={setFindMode}
              size="sm"
              className="gap-1.5 text-xs"
            >
              <Search className="h-3.5 w-3.5" />
              {t('discussion.findInNotes')}
            </Toggle>
            <ModePill mode={mode} />
          </div>
          
          {/* Input area */}
          <div className="flex items-end gap-2">
            <Textarea
              ref={textareaRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={MODE_PLACEHOLDERS[mode][language as 'ru' | 'en'] || t('discussion.placeholder')}
              disabled={sending}
              className="min-h-[44px] max-h-[150px] resize-none"
              rows={1}
            />
            <Button
              onClick={handleSend}
              disabled={!inputText.trim() || sending}
              size="icon"
              className="shrink-0 h-11 w-11"
            >
              {sending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>
      </div>
      
      {/* Context Drawer */}
      <ContextDrawer
        open={contextOpen}
        onOpenChange={setContextOpen}
        entryIds={session.scope.entryIds}
        docIds={session.scope.docIds}
        onAddFromToday={() => {
          navigate('/?selectMode=true');
        }}
      />
    </div>
  );
}

interface MessageBubbleProps {
  message: DiscussionMessage;
  language: string;
  onSelectQuestion?: (question: string) => void;
}

function MessageBubble({ message, language, onSelectQuestion }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isError = message.status === 'error';
  
  return (
    <div className={cn(
      "flex items-start gap-3",
      isUser && "flex-row-reverse"
    )}>
      <div className={cn(
        "h-8 w-8 rounded-full flex items-center justify-center shrink-0",
        isUser ? "bg-primary text-primary-foreground" : "bg-primary/10"
      )}>
        {isUser ? (
          <User className="h-4 w-4" />
        ) : (
          <Bot className="h-4 w-4 text-primary" />
        )}
      </div>
      
      <div className={cn(
        "flex-1 max-w-[85%]",
        isUser && "flex flex-col items-end"
      )}>
        <div className={cn(
          "p-3 rounded-lg",
          isUser 
            ? "bg-primary text-primary-foreground" 
            : isError 
              ? "bg-destructive/10 border border-destructive/30"
              : "bg-muted/50"
        )}>
          {isError && (
            <div className="flex items-center gap-2 text-destructive mb-2">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm font-medium">
                {language === 'ru' ? 'Ошибка' : 'Error'}
              </span>
            </div>
          )}
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        </div>
        
        {/* Draft Artifact */}
        {message.meta?.draftArtifact && (
          <div className="mt-3 w-full">
            <DraftArtifact artifact={message.meta.draftArtifact} />
          </div>
        )}
        
        {/* Analysis Artifact */}
        {message.meta?.analysisArtifact && (
          <div className="mt-3 w-full">
            <AnalysisArtifact artifact={message.meta.analysisArtifact} />
          </div>
        )}
        
        {/* Compute Artifact */}
        {message.meta?.computeArtifact && (
          <div className="mt-3 w-full">
            <ComputeArtifact artifact={message.meta.computeArtifact} />
          </div>
        )}
        
        {/* Plan Artifact */}
        {message.meta?.planArtifact && (
          <div className="mt-3 w-full">
            <PlanArtifact artifact={message.meta.planArtifact} />
          </div>
        )}
        
        {/* Follow-up Questions */}
        {message.meta?.questions && message.meta.questions.length > 0 && onSelectQuestion && (
          <div className="mt-3 w-full">
            <FollowUpQuestions 
              questions={message.meta.questions} 
              onSelect={onSelectQuestion}
            />
          </div>
        )}
        
        {/* Evidence */}
        {message.evidenceRefs && message.evidenceRefs.length > 0 && (
          <div className="mt-3 w-full">
            <EvidenceList 
              evidence={message.evidenceRefs}
              usedIds={message.evidenceRefs.map(e => e.id)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default function DiscussionChatPage() {
  return (
    <ErrorBoundary>
      <DiscussionChatContent />
    </ErrorBoundary>
  );
}
