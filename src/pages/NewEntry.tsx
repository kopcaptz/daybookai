import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { format } from 'date-fns';
import { ru, enUS } from 'date-fns/locale';
import { ArrowLeft, Lock, LockOpen, Save, Trash2, Loader2 } from 'lucide-react';
import { QuillSigilIcon, SealIcon } from '@/components/icons/SigilIcon';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { 
  createEntry, 
  updateEntry, 
  getEntryById, 
  getAllTags, 
  deleteEntry,
  addAttachment,
  getAttachmentsByEntryId,
  deleteAttachmentsByEntryIdInTransaction,
} from '@/lib/db';
import {
  isBiographyStale,
  wasUpdatePrompted,
  markUpdatePrompted,
  getTodayDate,
  requestBiographyGeneration,
  getBiography,
} from '@/lib/biographyService';
import { loadAISettings } from '@/lib/aiConfig';
import { usePredictiveMood } from '@/hooks/usePredictiveMood';
import { useAutoTags } from '@/hooks/useAutoTags';
import { detectActionableText, type SuggestedTime } from '@/lib/reminderDetection';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { MoodSelector } from '@/components/MoodSelector';
import { TagSelector } from '@/components/TagSelector';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { MediaToolbar } from '@/components/media/MediaToolbar';
import { AttachmentList, AttachmentPreview } from '@/components/media/AttachmentList';
import { StorageIndicator } from '@/components/StorageIndicator';
import { LinkedReceiptsList } from '@/components/receipts/LinkedReceiptsList';
import { ReminderPrompt } from '@/components/reminders/ReminderPrompt';
import { useDraft, loadDraft, removeDraft, hasDraftContent } from '@/hooks/useDraft';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

function EntryEditorContent() {
  const navigate = useNavigate();
  const { id, date: dateParam } = useParams<{ id: string; date?: string }>();
  const { t, language } = useI18n();
  const isEditing = Boolean(id);
  const draftId = id || 'new';

  // Entry date: from param, or today for new entries
  const entryDate = dateParam || format(new Date(), 'yyyy-MM-dd');

  const [text, setText] = useState('');
  const [mood, setMood] = useState(3);
  const [tags, setTags] = useState<string[]>([]);
  const [isPrivate, setIsPrivate] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentPreview[]>([]);
  
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [showDraftDialog, setShowDraftDialog] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<any>(null);
  const [storageRefreshKey, setStorageRefreshKey] = useState(0);
  
  // Stale biography update prompt
  const [showUpdateBioDialog, setShowUpdateBioDialog] = useState(false);
  const [staleBioDate, setStaleBioDate] = useState<string | null>(null);
  const [isUpdatingBio, setIsUpdatingBio] = useState(false);
  
  // Reminder prompt state (after saving actionable entry)
  const [reminderPromptOpen, setReminderPromptOpen] = useState(false);
  const [reminderPromptEntryId, setReminderPromptEntryId] = useState<number | null>(null);
  const [reminderPromptSourceText, setReminderPromptSourceText] = useState('');
  const [reminderPromptSuggestedTime, setReminderPromptSuggestedTime] = useState<SuggestedTime>('tomorrow_morning');

  const allTags = useLiveQuery(() => getAllTags(), []);

  // Predictive mood tracking
  const predictiveMood = usePredictiveMood({
    text,
    currentMood: mood,
    enabled: true,
  });

  // Auto-tags detection
  const autoTags = useAutoTags({
    text,
    currentTags: tags,
    onTagsChange: setTags,
    enabled: true,
  });

  // Handle mood change with user override tracking
  const handleMoodChange = (newMood: number) => {
    setMood(newMood);
    predictiveMood.setUserOverride();
  };

  // Draft autosave
  useDraft({
    draftId,
    data: { text, mood, tags, isPrivate, attachments },
    enabled: isLoaded && !isSaving,
  });

  // Load existing entry or check for draft
  useEffect(() => {
    const loadData = async () => {
      try {
        if (isEditing && id) {
          const entry = await getEntryById(Number(id));
          if (entry) {
            setText(entry.text);
            setMood(entry.mood);
            setTags(entry.tags);
            setIsPrivate(entry.isPrivate);
            
            try {
              const existingAttachments = await getAttachmentsByEntryId(Number(id));
              setAttachments(existingAttachments.map(a => ({
                tempId: `existing-${a.id}`,
                kind: a.kind,
                mimeType: a.mimeType,
                size: a.size,
                duration: a.duration,
                blob: a.blob,
                thumbnail: a.thumbnail,
              })));
            } catch (e) {
              console.warn('Failed to load attachments:', e);
            }
          }
        } else {
          try {
            const draft = await loadDraft(draftId);
            if (draft && hasDraftContent(draft)) {
              setPendingDraft(draft);
              setShowDraftDialog(true);
              return;
            }
          } catch (e) {
            console.warn('Failed to load draft:', e);
          }
        }
      } catch (e) {
        console.error('Failed to load entry:', e);
      }
      setIsLoaded(true);
    };

    loadData();
  }, [id, isEditing, draftId]);

  const handleRestoreDraft = () => {
    if (pendingDraft) {
      setText(pendingDraft.text);
      setMood(pendingDraft.mood);
      setTags(pendingDraft.tags);
      setIsPrivate(pendingDraft.isPrivate);
      setAttachments(pendingDraft.attachments);
    }
    setShowDraftDialog(false);
    setIsLoaded(true);
  };

  const handleDiscardDraft = async () => {
    await removeDraft(draftId);
    setShowDraftDialog(false);
    setIsLoaded(true);
  };

  const handlePhotoCapture = useCallback((blob: Blob, mimeType: string) => {
    const tempId = `photo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    setAttachments(prev => [...prev, {
      tempId,
      kind: 'image',
      mimeType,
      size: blob.size,
      blob,
    }]);
    setStorageRefreshKey(k => k + 1);
  }, []);

  // Video capture removed from UI - video attachments can still exist from legacy data
  // but no new videos can be added through the interface

  const handleAudioCapture = useCallback((blob: Blob, mimeType: string, duration: number) => {
    const tempId = `audio-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    setAttachments(prev => [...prev, {
      tempId,
      kind: 'audio',
      mimeType,
      size: blob.size,
      duration,
      blob,
    }]);
    setStorageRefreshKey(k => k + 1);
  }, []);

  const handleDictation = useCallback((transcript: string) => {
    setText(prev => {
      const separator = prev.trim() ? ' ' : '';
      return prev + separator + transcript;
    });
  }, []);

  const handleRemoveAttachment = useCallback((tempId: string) => {
    setAttachments(prev => prev.filter(a => a.tempId !== tempId));
    setStorageRefreshKey(k => k + 1);
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    
    const today = getTodayDate();
    const saveDate = entryDate;
    
    // Step logging helper (no sensitive data)
    const log = (step: string, data?: Record<string, unknown>) => {
      console.info(`[Daybook] SAVE_${step}`, { 
        date: saveDate, 
        isEdit: isEditing, 
        attachCount: attachments.length,
        ...data 
      });
    };
    
    log('START', { textLen: text.length, tagsCount: tags.length });
    
    try {
      let entryId: number;
      let saveSuccess = false;
      let deletedCount = 0;
      let insertedCount = 0;

      const { db } = await import('@/lib/db');
      
      log('TX_BEGIN');
      
      await db.transaction('rw', [db.entries, db.attachments, db.attachmentInsights], async () => {
        if (isEditing && id) {
          entryId = Number(id);
          await updateEntry(entryId, {
            text,
            mood,
            tags,
            isPrivate,
          });
          log('ENTRY_UPDATE_OK', { id: entryId });
          
          // Count existing before delete
          const existing = await db.attachments.where('entryId').equals(entryId).count();
          await deleteAttachmentsByEntryIdInTransaction(entryId);
          deletedCount = existing;
          log('ATTACH_DELETE_OK', { count: deletedCount });
        } else {
          entryId = await createEntry({
            date: saveDate,
            text,
            mood,
            tags,
            isPrivate,
          });
          log('ENTRY_CREATE_OK', { id: entryId });
        }

        // Save attachments within same transaction
        for (const attachment of attachments) {
          await addAttachment({
            entryId,
            kind: attachment.kind,
            mimeType: attachment.mimeType,
            size: attachment.size,
            duration: attachment.duration,
            blob: attachment.blob,
            thumbnail: attachment.thumbnail,
          });
          insertedCount++;
        }
        log('ATTACH_INSERT_OK', { count: insertedCount });
        
        saveSuccess = true;
      });
      
      log('TX_COMMIT_OK');

      if (!saveSuccess) {
        throw new Error('Transaction did not complete');
      }
      
      // Verify entry and attachments were written
      const savedEntry = await getEntryById(entryId!);
      if (!savedEntry) {
        throw new Error('Entry verification failed - not found after save');
      }
      
      const savedAttachments = await db.attachments.where('entryId').equals(entryId!).count();
      log('VERIFY_READ_OK', { id: entryId!, attachSaved: savedAttachments, expected: attachments.length });
      
      if (savedAttachments !== attachments.length) {
        console.warn('[Daybook] Attachment count mismatch!', { saved: savedAttachments, expected: attachments.length });
      }
      
      await removeDraft(draftId);
      log('SAVE_DONE', { entryId: entryId! });

      toast.success(t('entry.saved'));

      // Check for stale biography if saving to a past date
      const aiSettings = loadAISettings();
      if (aiSettings.enabled && saveDate < today && !wasUpdatePrompted(saveDate)) {
        const isStale = await isBiographyStale(saveDate);
        if (isStale) {
          setStaleBioDate(saveDate);
          setShowUpdateBioDialog(true);
          setIsSaving(false);
          return;
        }
      }

      // Check for actionable content (only for non-private, new entries)
      if (!isEditing && !isPrivate && text.trim()) {
        const detection = detectActionableText(text);
        if (detection.isActionable && detection.suggestedTime) {
          setReminderPromptEntryId(entryId!);
          setReminderPromptSourceText(text);
          setReminderPromptSuggestedTime(detection.suggestedTime);
          setReminderPromptOpen(true);
          setIsSaving(false);
          return; // Don't navigate yet - wait for prompt
        }
      }

      navigate(-1);
    } catch (error) {
      const err = error as Error;
      const errorName = err.name || 'UnknownError';
      const errorMessage = err.message || 'Unknown error';
      const errorStack = err.stack?.split('\n').slice(0, 3).join(' | ') || '';
      
      // Detailed error log
      log('FAILED', { 
        name: errorName, 
        message: errorMessage,
        stack: errorStack,
        // Check for Dexie-specific error properties
        isDexieError: 'inner' in err || errorName.includes('Dexie'),
      });
      
      console.error('[Daybook] Full error:', error);
      
      // Show REAL error to user for debugging
      const isQuotaError = errorMessage.includes('quota') || errorMessage.includes('QuotaExceeded');
      const errorTitle = isQuotaError 
        ? (language === 'ru' ? 'Недостаточно места' : 'Not enough storage')
        : (language === 'ru' ? 'Ошибка сохранения' : 'Save failed');
      
      toast.error(errorTitle, {
        description: `${errorName}: ${errorMessage.slice(0, 100)}`,
        duration: 8000,
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Handle biography update choice
  const handleUpdateBiography = async () => {
    if (!staleBioDate) return;
    
    setIsUpdatingBio(true);
    markUpdatePrompted(staleBioDate);
    
    try {
      await requestBiographyGeneration(staleBioDate, language, true);
    } finally {
      setIsUpdatingBio(false);
      setShowUpdateBioDialog(false);
      navigate(-1);
    }
  };

  const handleSkipBioUpdate = async () => {
    if (!staleBioDate) return;
    
    markUpdatePrompted(staleBioDate);
    
    // Mark biography as pending for later retry
    const bio = await getBiography(staleBioDate);
    if (bio && bio.status === 'complete') {
      // Keep existing biography but flag for potential update
      // We don't change status here, user can manually regenerate later
    }
    
    setShowUpdateBioDialog(false);
    navigate(-1);
  };

  const handleDelete = async () => {
    if (!id) return;
    setIsDeleting(true);
    try {
      await deleteEntry(Number(id));
      await removeDraft(draftId);
      toast.success(t('entry.deleted'));
      navigate(-1);
    } catch (error) {
      console.error('Delete failed:', error);
      toast.error(t('common.error'));
    } finally {
      setIsDeleting(false);
    }
  };

  const dateFormatted = format(
    dateParam ? new Date(dateParam + 'T12:00:00') : new Date(), 
    "d MMMM, EEEE", 
    { locale: language === 'ru' ? ru : enUS }
  );
  const isPastDate = entryDate < getTodayDate();

  // Draft restore dialog
  if (showDraftDialog) {
    return (
      <AlertDialog open={showDraftDialog} onOpenChange={setShowDraftDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('draft.found')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('draft.foundDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
            <AlertDialogAction onClick={handleRestoreDraft} className="w-full">
              {t('common.restore')}
            </AlertDialogAction>
            <AlertDialogCancel onClick={handleDiscardDraft} className="w-full">
              {t('common.discard')}
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <>
      {/* Stale Biography Update Dialog */}
      <Dialog open={showUpdateBioDialog} onOpenChange={setShowUpdateBioDialog}>
        <DialogContent className="sm:max-w-md panel-glass">
          <DialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-lg panel-glass">
              <SealIcon className="h-6 w-6 text-cyber-sigil" />
            </div>
            <DialogTitle className="text-center font-serif">
              {t('bio.updateSeal')}
            </DialogTitle>
            <DialogDescription className="text-center">
              {language === 'ru'
                ? `Вы добавили запись за ${staleBioDate ? format(new Date(staleBioDate + 'T12:00:00'), 'd MMMM', { locale: ru }) : ''}. ${t('bio.updateSealHint')}`
                : `You added an entry for ${staleBioDate ? format(new Date(staleBioDate + 'T12:00:00'), 'MMMM d', { locale: enUS }) : ''}. ${t('bio.updateSealHint')}`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              onClick={handleUpdateBiography}
              disabled={isUpdatingBio}
              className="w-full gap-2 btn-cyber"
            >
              {isUpdatingBio ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('bio.updating')}
                </>
              ) : (
                <>
                  <SealIcon className="h-4 w-4" />
                  {t('bio.update')}
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={handleSkipBioUpdate}
              disabled={isUpdatingBio}
              className="w-full"
            >
              {t('bio.later')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className={cn(
        "min-h-screen pb-8 cyber-noise rune-grid",
        "animate-page-materialize"
      )}>
      <header className="sticky top-0 z-40 flex items-center justify-between bg-background/80 backdrop-blur-xl px-4 py-4 border-b border-border/50">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="hover:bg-cyber-glow/10">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2">
          <QuillSigilIcon className="h-5 w-5 text-cyber-sigil" />
          <h1 className="text-lg font-serif font-medium">
            {isEditing ? t('entry.edit') : t('entry.new')}
          </h1>
        </div>
        <div className="flex gap-2">
          {isEditing && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" disabled={isDeleting} className="hover:bg-destructive/10">
                  <Trash2 className="h-5 w-5 text-destructive" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="panel-glass">
                <AlertDialogHeader>
                  <AlertDialogTitle className="font-serif">{t('entry.deleteConfirm')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('entry.deleteDesc')}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    className="bg-destructive text-destructive-foreground"
                  >
                    {t('common.delete')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <Button onClick={handleSave} disabled={isSaving} className="gap-2 btn-cyber">
            <Save className="h-4 w-4" />
            {isSaving ? t('common.loading') : t('common.save')}
          </Button>
        </div>
      </header>

      <main className="space-y-6 px-4 pt-4">
        {!isEditing && (
          <div className="flex items-center gap-2">
            <QuillSigilIcon className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm capitalize text-muted-foreground">
              {dateFormatted}
              {isPastDate && (
                <span className="ml-2 text-xs text-yellow-500">
                  ({t('misc.pastDate')})
                </span>
              )}
            </p>
          </div>
        )}

        {/* Text input with cyber styling */}
        <div className="panel-glass p-4">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('entry.placeholder')}
            className="min-h-[150px] resize-none text-base leading-relaxed border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/50"
            autoFocus={!isEditing}
          />
        </div>

        {/* Media toolbar */}
        <MediaToolbar
          onPhotoCapture={handlePhotoCapture}
          onAudioCapture={handleAudioCapture}
          onDictation={handleDictation}
          disabled={isSaving}
        />

        {/* Attachments preview */}
        <AttachmentList
          attachments={attachments}
          onRemove={handleRemoveAttachment}
          disabled={isSaving}
        />
        
        {/* Local storage hint */}
        {attachments.length > 0 && (
          <p className="text-xs text-muted-foreground/70 text-center -mt-3">
            {t('media.localStorageHint')}
          </p>
        )}

        {/* Mood selector with predictive suggestions */}
        <MoodSelector 
          value={mood} 
          onChange={handleMoodChange}
          suggestedMood={predictiveMood.suggestedMood}
          suggestionSource={predictiveMood.source}
          onSuggestionAccept={() => {
            if (predictiveMood.suggestedMood) {
              setMood(predictiveMood.suggestedMood);
            }
          }}
        />

        {/* Tag selector with auto-suggestions */}
        <TagSelector 
          value={tags} 
          onChange={setTags} 
          allTags={allTags}
          suggestedTags={autoTags.suggestedTags}
          onAcceptTag={autoTags.acceptTag}
          onDismissTag={autoTags.dismissTag}
          onAcceptAll={autoTags.acceptAll}
        />

        {/* Private toggle with cyber styling */}
        <div className="flex items-center justify-between panel-glass p-4">
          <div className="flex items-center gap-3">
            {isPrivate ? (
              <Lock className="h-5 w-5 text-cyber-sigil" />
            ) : (
              <LockOpen className="h-5 w-5 text-muted-foreground" />
            )}
            <div>
              <Label htmlFor="private-mode" className="text-sm font-medium">
                {t('entry.private')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t('entry.privateDesc')}
              </p>
            </div>
          </div>
          <Switch
            id="private-mode"
            checked={isPrivate}
            onCheckedChange={setIsPrivate}
          />
        </div>

        {/* Linked receipts (only when editing) */}
        {isEditing && id && (
          <LinkedReceiptsList entryId={Number(id)} entryDate={entryDate} />
        )}

        {/* Storage indicator */}
        <div className="panel-glass p-3">
          <StorageIndicator refreshKey={storageRefreshKey} />
        </div>
      </main>
      </div>
      
      {/* Reminder Prompt (shown after saving actionable entry) */}
      {reminderPromptEntryId !== null && (
        <ReminderPrompt
          open={reminderPromptOpen}
          onOpenChange={(open) => {
            setReminderPromptOpen(open);
            if (!open) {
              // User dismissed without creating - navigate away
              navigate(-1);
            }
          }}
          entryId={reminderPromptEntryId}
          sourceText={reminderPromptSourceText}
          suggestedTime={reminderPromptSuggestedTime}
        />
      )}
    </>
  );
}

export default function NewEntry() {
  return (
    <ErrorBoundary>
      <EntryEditorContent />
    </ErrorBoundary>
  );
}
