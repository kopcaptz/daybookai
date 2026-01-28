import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, MessageSquare, Loader2 } from 'lucide-react';
import { getAllDiscussionSessions, toggleDiscussionSessionPin, deleteDiscussionSession, createDiscussionSession, DiscussionSession } from '@/lib/db';
import { SessionCard } from '@/components/discussions/SessionCard';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import { GrimoireIcon, SealGlyph } from '@/components/icons/SigilIcon';
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

function DiscussionsListContent() {
  const { t, language } = useI18n();
  const navigate = useNavigate();
  
  const sessions = useLiveQuery(() => getAllDiscussionSessions(), []);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  
  const handlePin = async (id: number) => {
    await toggleDiscussionSessionPin(id);
  };
  
  const handleDeleteConfirm = async () => {
    if (deleteId) {
      await deleteDiscussionSession(deleteId);
      setDeleteId(null);
    }
  };
  
  const handleNewDiscussion = async () => {
    setCreating(true);
    try {
      const id = await createDiscussionSession({
        title: language === 'ru' ? 'Новое обсуждение' : 'New discussion',
        scope: { entryIds: [], docIds: [] },
        modeDefault: 'discuss',
      });
      navigate(`/discussions/${id}`);
    } finally {
      setCreating(false);
    }
  };
  
  if (!sessions) {
    return (
      <div className="space-y-4 px-4 pt-24">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg bg-muted grimoire-shadow" />
        ))}
      </div>
    );
  }
  
  return (
    <div className="min-h-screen pb-24 cyber-noise rune-grid">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl px-4 py-6 border-b border-border/50">
        {/* Brand header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <MessageSquare className="h-6 w-6 text-cyber-sigil" />
              <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-cyber-glow animate-sigil-pulse" />
            </div>
            <div>
              <h1 className="text-xl font-serif font-medium text-foreground tracking-wide">
                {t('discussions.title')}
              </h1>
              <p className="text-xs text-cyber-sigil/60 tracking-widest uppercase">
                {language === 'ru' ? 'Чат с записями' : 'Chat with entries'}
              </p>
            </div>
          </div>
          
          <Button
            onClick={handleNewDiscussion}
            disabled={creating}
            size="sm"
            className="gap-1.5"
          >
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {t('discussions.new')}
          </Button>
        </div>
        
        {/* Rune divider */}
        <div className="mt-4 rune-divider">
          <span className="sigil-separator">◆</span>
        </div>
      </header>
      
      <main className="px-4 pt-4">
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-6 p-8 panel-glass relative">
              <MessageSquare className="h-12 w-12 text-muted-foreground" />
              <div className="absolute top-3 right-3 text-cyber-sigil/40">
                <SealGlyph size={12} />
              </div>
              <div className="absolute bottom-3 left-3 text-cyber-rune/30">
                <SealGlyph size={12} />
              </div>
            </div>
            <h3 className="mb-2 text-xl font-serif font-medium">{t('discussions.empty')}</h3>
            <p className="max-w-xs text-sm text-muted-foreground leading-relaxed">
              {t('discussions.emptyHint')}
            </p>
            <div className="mt-6 flex items-center gap-3 text-cyber-sigil/30">
              <SealGlyph size={10} />
              <div className="w-16 h-px bg-gradient-to-r from-transparent via-cyber-glow/30 to-transparent" />
              <SealGlyph size={10} />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map((session, index) => (
              <div 
                key={session.id} 
                className="animate-fade-in"
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                <SessionCard 
                  session={session}
                  onPin={handlePin}
                  onDelete={(id) => setDeleteId(id)}
                />
              </div>
            ))}
          </div>
        )}
      </main>
      
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('discussions.deleteConfirm')}</AlertDialogTitle>
            <AlertDialogDescription>
              {language === 'ru' 
                ? 'Это действие нельзя отменить. Все сообщения будут удалены.'
                : 'This action cannot be undone. All messages will be deleted.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground">
              {t('discussions.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function DiscussionsListPage() {
  return (
    <ErrorBoundary>
      <DiscussionsListContent />
    </ErrorBoundary>
  );
}
