import { useState } from 'react';
import { Anchor, ChevronDown, ChevronUp, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { TaskCard } from './TaskCard';
import { TaskEditor } from './TaskEditor';
import { useToast } from '@/hooks/use-toast';
import { useI18n, getBaseLanguage } from '@/lib/i18n';
import type { EtherealTask } from '@/lib/etherealDb';
import type { TaskInput } from '@/hooks/useEtherealTasks';

const texts = {
  newTask: { ru: 'Новая задача', en: 'New task' },
  loading: { ru: 'Загрузка...', en: 'Loading...' },
  seaCalm: { ru: 'Море спокойно', en: 'Sea is calm' },
  noTasksOnBridge: { ru: 'Дел на мостике нет', en: 'No tasks on the bridge' },
  onBridge: { ru: 'На мостике', en: 'On the bridge' },
  tasks: { ru: 'Задачи', en: 'Tasks' },
  completed: { ru: 'Выполнено', en: 'Completed' },
  error: { ru: 'Ошибка', en: 'Error' },
  updateFailed: { ru: 'Не удалось обновить задачу', en: 'Failed to update task' },
  createFailed: { ru: 'Не удалось создать задачу', en: 'Failed to create task' },
  deleteFailed: { ru: 'Не удалось удалить задачу', en: 'Failed to delete task' },
  deleted: { ru: 'Задача удалена', en: 'Task deleted' },
  undo: { ru: 'Отмена', en: 'Undo' },
  undoHint: { ru: 'Нажмите "Отмена" чтобы восстановить', en: 'Click "Undo" to restore' },
} as const;

interface TasksListProps {
  groupedTasks: {
    urgent: EtherealTask[];
    active: EtherealTask[];
    done: EtherealTask[];
  };
  isLoading: boolean;
  error: string | null;
  onToggle: (taskId: string) => Promise<any>;
  onCreate: (input: TaskInput) => Promise<any>;
  onUpdate: (taskId: string, input: Partial<TaskInput>) => Promise<any>;
  onDelete: (taskId: string) => Promise<any>;
  members?: Array<{ id: string; displayName: string }>;
  currentMemberId?: string;
}

export function TasksList({
  groupedTasks,
  isLoading,
  error,
  onToggle,
  onCreate,
  onUpdate,
  onDelete,
  members = [],
  currentMemberId,
}: TasksListProps) {
  const [showDone, setShowDone] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<EtherealTask | undefined>();
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const { toast } = useToast();
  const { language } = useI18n();
  const lang = getBaseLanguage(language);
  const t = (key: keyof typeof texts) => texts[key][lang];

  const { urgent, active, done } = groupedTasks;
  const hasTasks = urgent.length > 0 || active.length > 0 || done.length > 0;

  const handleToggle = async (taskId: string) => {
    const result = await onToggle(taskId);
    if (!result.success) {
      toast({
        title: t('error'),
        description: t('updateFailed'),
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (taskId: string) => {
    setDeletingTaskId(taskId);

    // Show undo toast
    const toastResult = toast({
      title: t('deleted'),
      description: t('undoHint'),
      action: (
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => {
            setDeletingTaskId(null);
            toastResult.dismiss();
          }}
        >
          {t('undo')}
        </Button>
      ),
      duration: 10000,
    });

    // Wait for undo window
    setTimeout(async () => {
      if (deletingTaskId === taskId) {
        const result = await onDelete(taskId);
        if (!result.success) {
          toast({
            title: t('error'),
            description: t('deleteFailed'),
            variant: 'destructive',
          });
        }
        setDeletingTaskId(null);
      }
    }, 10000);
  };

  const handleSave = async (input: TaskInput) => {
    if (editingTask) {
      const result = await onUpdate(editingTask.serverId, input);
      if (!result.success) {
        toast({
          title: t('error'),
          description: t('updateFailed'),
          variant: 'destructive',
        });
      }
    } else {
      const result = await onCreate(input);
      if (!result.success) {
        toast({
          title: t('error'),
          description: t('createFailed'),
          variant: 'destructive',
        });
      }
    }
    setEditingTask(undefined);
  };

  const openEditor = (task?: EtherealTask) => {
    setEditingTask(task);
    setEditorOpen(true);
  };

  const closeEditor = () => {
    setEditorOpen(false);
    setEditingTask(undefined);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-muted-foreground">{t('loading')}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Create button */}
      <div className="px-4 pb-4">
        <Button
          onClick={() => openEditor()}
          className="w-full"
          variant="outline"
        >
          <Plus className="w-4 h-4 mr-2" />
          {t('newTask')}
        </Button>
      </div>

      {/* Tasks list */}
      <div className="flex-1 overflow-y-auto px-4 pb-24 space-y-4">
        {!hasTasks ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <Anchor className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-2">{t('seaCalm')}</h3>
            <p className="text-sm text-muted-foreground">{t('noTasksOnBridge')}</p>
          </div>
        ) : (
          <>
            {/* Urgent section */}
            {urgent.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold text-destructive mb-2 px-1">
                  {t('onBridge')} ({urgent.length})
                </h3>
                <div className="space-y-2">
                  {urgent
                    .filter((t) => t.serverId !== deletingTaskId)
                    .map((task) => (
                      <TaskCard
                        key={task.serverId}
                        task={task}
                        onToggle={() => handleToggle(task.serverId)}
                        onTap={() => openEditor(task)}
                        onDelete={() => handleDelete(task.serverId)}
                      />
                    ))}
                </div>
              </section>
            )}

            {/* Active section */}
            {active.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold text-foreground mb-2 px-1">
                  {t('tasks')} ({active.length})
                </h3>
                <div className="space-y-2">
                  {active
                    .filter((t) => t.serverId !== deletingTaskId)
                    .map((task) => (
                      <TaskCard
                        key={task.serverId}
                        task={task}
                        onToggle={() => handleToggle(task.serverId)}
                        onTap={() => openEditor(task)}
                        onDelete={() => handleDelete(task.serverId)}
                      />
                    ))}
                </div>
              </section>
            )}

            {/* Done section (collapsible) */}
            {done.length > 0 && (
              <Collapsible open={showDone} onOpenChange={setShowDone}>
                <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full px-1 py-2">
                  {showDone ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                  {t('completed')} ({done.length})
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="space-y-2 pt-2">
                    {done
                      .filter((t) => t.serverId !== deletingTaskId)
                      .map((task) => (
                        <TaskCard
                          key={task.serverId}
                          task={task}
                          onToggle={() => handleToggle(task.serverId)}
                          onTap={() => openEditor(task)}
                          onDelete={() => handleDelete(task.serverId)}
                        />
                      ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
          </>
        )}
      </div>

      {/* Task editor sheet */}
      <TaskEditor
        open={editorOpen}
        onClose={closeEditor}
        onSave={handleSave}
        task={editingTask}
        members={members}
        currentMemberId={currentMemberId}
      />
    </div>
  );
}
