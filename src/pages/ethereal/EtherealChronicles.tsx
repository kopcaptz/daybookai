import { useState, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { isEtherealSessionValid } from '@/lib/etherealTokenService';
import { EtherealHeader } from '@/components/ethereal/EtherealHeader';
import { EtherealBottomTabs } from '@/components/ethereal/EtherealBottomTabs';
import { ChroniclesList } from '@/components/ethereal/ChroniclesList';
import { ChronicleView } from '@/components/ethereal/ChronicleView';
import { ChronicleEditor } from '@/components/ethereal/ChronicleEditor';
import { useEtherealChronicles } from '@/hooks/useEtherealChronicles';
import { EtherealChronicle } from '@/lib/etherealDb';
import { toast } from 'sonner';

type ViewMode = 'list' | 'view' | 'edit' | 'create';

export default function EtherealChronicles() {
  if (!isEtherealSessionValid()) {
    return <Navigate to="/e/home" replace />;
  }

  const {
    chronicles,
    loading,
    refresh,
    createChronicle,
    updateChronicle,
    togglePin,
    lockChronicle,
    unlockChronicle,
    getChronicle,
  } = useEtherealChronicles();

  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedChronicle, setSelectedChronicle] = useState<EtherealChronicle | null>(null);
  const [editLockState, setEditLockState] = useState<{
    isLocked: boolean;
    lockedByName?: string;
  }>({ isLocked: false });

  const handleSelect = useCallback(async (chronicle: EtherealChronicle) => {
    // Fetch fresh data
    const fresh = await getChronicle(chronicle.serverId);
    setSelectedChronicle(fresh || chronicle);
    setViewMode('view');
  }, [getChronicle]);

  const handleCreate = useCallback(() => {
    setSelectedChronicle(null);
    setViewMode('create');
  }, []);

  const handleEdit = useCallback(async () => {
    if (!selectedChronicle) return;

    // Try to acquire lock
    const result = await lockChronicle(selectedChronicle.serverId);
    if (!result) {
      toast.error('Не удалось взять запись в редактирование');
      return;
    }

    if (!result.locked) {
      toast.warning(`${result.lockedByName || 'Кто-то'} уже редактирует эту запись`);
      setEditLockState({ isLocked: true, lockedByName: result.lockedByName });
    } else {
      setEditLockState({ isLocked: false });
    }

    setViewMode('edit');
  }, [selectedChronicle, lockChronicle]);

  const handleBack = useCallback(async () => {
    // If editing, release lock
    if (viewMode === 'edit' && selectedChronicle) {
      await unlockChronicle(selectedChronicle.serverId);
    }
    
    if (viewMode === 'view' || viewMode === 'create') {
      setViewMode('list');
      setSelectedChronicle(null);
    } else if (viewMode === 'edit') {
      // Go back to view
      const fresh = await getChronicle(selectedChronicle!.serverId);
      setSelectedChronicle(fresh || selectedChronicle);
      setViewMode('view');
    }
  }, [viewMode, selectedChronicle, unlockChronicle, getChronicle]);

  const handleSave = useCallback(async (data: { title: string; content: string; tags: string[] }) => {
    if (viewMode === 'create') {
      const created = await createChronicle(data.title, data.content, data.tags);
      if (created) {
        toast.success('Запись создана');
        setSelectedChronicle(created);
        setViewMode('view');
      } else {
        toast.error('Не удалось создать запись');
      }
    } else if (selectedChronicle) {
      const updated = await updateChronicle(selectedChronicle.serverId, data);
      if (updated) {
        toast.success('Запись сохранена');
        setSelectedChronicle(updated);
        setViewMode('view');
      } else {
        toast.error('Не удалось сохранить запись');
      }
    }
  }, [viewMode, selectedChronicle, createChronicle, updateChronicle]);

  const handleTogglePin = useCallback(async () => {
    if (!selectedChronicle) return;
    const newPinned = await togglePin(selectedChronicle.serverId);
    setSelectedChronicle({ ...selectedChronicle, pinned: newPinned });
    toast.success(newPinned ? 'Запись закреплена' : 'Запись откреплена');
  }, [selectedChronicle, togglePin]);

  const handleLockRefresh = useCallback(async (): Promise<boolean> => {
    if (!selectedChronicle) return false;
    const result = await lockChronicle(selectedChronicle.serverId);
    if (!result) return false;
    
    if (!result.locked) {
      setEditLockState({ isLocked: true, lockedByName: result.lockedByName });
      return false;
    }
    return true;
  }, [selectedChronicle, lockChronicle]);

  return (
    <div className="flex flex-col min-h-screen yacht-gradient">
      {viewMode === 'list' && (
        <EtherealHeader title="Библиотека" subtitle="Хроники" />
      )}

      <div className="flex-1 flex flex-col">
        {viewMode === 'list' && (
          <ChroniclesList
            chronicles={chronicles}
            loading={loading}
            onSelect={handleSelect}
            onCreate={handleCreate}
            onRefresh={refresh}
          />
        )}

        {viewMode === 'view' && selectedChronicle && (
          <ChronicleView
            chronicle={selectedChronicle}
            onBack={handleBack}
            onEdit={handleEdit}
            onTogglePin={handleTogglePin}
          />
        )}

        {(viewMode === 'edit' || viewMode === 'create') && (
          <ChronicleEditor
            chronicle={viewMode === 'edit' ? selectedChronicle : null}
            onSave={handleSave}
            onCancel={handleBack}
            lockRefresh={viewMode === 'edit' ? handleLockRefresh : undefined}
            isLocked={editLockState.isLocked}
            lockedByName={editLockState.lockedByName}
          />
        )}
      </div>

      {viewMode === 'list' && <EtherealBottomTabs />}
    </div>
  );
}
