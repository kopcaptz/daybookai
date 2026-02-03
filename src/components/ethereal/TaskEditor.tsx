import { useState, useEffect } from 'react';
import { format, addDays, startOfToday } from 'date-fns';
import { Calendar, User, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useI18n, getBaseLanguage } from '@/lib/i18n';
import type { EtherealTask } from '@/lib/etherealDb';
import type { TaskInput } from '@/hooks/useEtherealTasks';

const texts = {
  editTask: { ru: 'Редактировать задачу', en: 'Edit task' },
  newTask: { ru: 'Новая задача', en: 'New task' },
  whatToDo: { ru: 'Что нужно сделать?', en: 'What needs to be done?' },
  detailsOptional: { ru: 'Подробности (опционально)', en: 'Details (optional)' },
  assignTo: { ru: 'Кому поручить?', en: 'Assign to' },
  everyone: { ru: 'Всем', en: 'Everyone' },
  me: { ru: 'Мне', en: 'Me' },
  whenToDo: { ru: 'Когда сделать?', en: 'When to do?' },
  noDueDate: { ru: 'Без срока', en: 'No due date' },
  today: { ru: 'Сегодня', en: 'Today' },
  tomorrow: { ru: 'Завтра', en: 'Tomorrow' },
  date: { ru: 'Дата', en: 'Date' },
  priority: { ru: 'Приоритет', en: 'Priority' },
  normal: { ru: 'Обычный', en: 'Normal' },
  urgent: { ru: 'Срочно', en: 'Urgent' },
  cancel: { ru: 'Отмена', en: 'Cancel' },
  save: { ru: 'Сохранить', en: 'Save' },
  saving: { ru: 'Сохранение...', en: 'Saving...' },
} as const;

interface TaskEditorProps {
  open: boolean;
  onClose: () => void;
  onSave: (input: TaskInput) => Promise<void>;
  task?: EtherealTask;
  members?: Array<{ id: string; displayName: string }>;
  currentMemberId?: string;
}

type QuickDate = 'none' | 'today' | 'tomorrow' | 'custom';

export function TaskEditor({
  open,
  onClose,
  onSave,
  task,
  members = [],
  currentMemberId,
}: TaskEditorProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeId, setAssigneeId] = useState<string | undefined>();
  const [dueDate, setDueDate] = useState<Date | undefined>();
  const [quickDate, setQuickDate] = useState<QuickDate>('none');
  const [priority, setPriority] = useState<'normal' | 'urgent'>('normal');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);

  const { language } = useI18n();
  const lang = getBaseLanguage(language);
  const t = (key: keyof typeof texts) => texts[key][lang];

  const isEditing = !!task;

  // Initialize from task
  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || '');
      setAssigneeId(task.assigneeId);
      setDueDate(task.dueAtMs ? new Date(task.dueAtMs) : undefined);
      setPriority(task.priority || 'normal');
      setQuickDate(task.dueAtMs ? 'custom' : 'none');
    } else {
      setTitle('');
      setDescription('');
      setAssigneeId(undefined);
      setDueDate(undefined);
      setQuickDate('none');
      setPriority('normal');
    }
  }, [task, open]);

  const handleQuickDate = (option: QuickDate) => {
    setQuickDate(option);
    if (option === 'none') {
      setDueDate(undefined);
    } else if (option === 'today') {
      setDueDate(startOfToday());
    } else if (option === 'tomorrow') {
      setDueDate(addDays(startOfToday(), 1));
    }
    // 'custom' opens calendar popover
  };

  const handleSubmit = async () => {
    if (!title.trim()) return;

    setIsSubmitting(true);
    try {
      await onSave({
        title: title.trim(),
        description: description.trim() || undefined,
        assigneeId,
        dueAt: dueDate?.toISOString(),
        priority,
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="h-auto max-h-[90vh] yacht-gradient">
        <SheetHeader className="pb-4">
          <SheetTitle>{isEditing ? t('editTask') : t('newTask')}</SheetTitle>
        </SheetHeader>

        <div className="space-y-4">
          {/* Title */}
          <div>
            <Input
              placeholder={t('whatToDo')}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-base"
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <Textarea
              placeholder={t('detailsOptional')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[60px] resize-none"
            />
          </div>

          {/* Assignee */}
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-1.5">
              <User className="w-4 h-4" />
              {t('assignTo')}
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={!assigneeId ? 'default' : 'outline'}
                size="sm"
                onClick={() => setAssigneeId(undefined)}
              >
                {t('everyone')}
              </Button>
              {currentMemberId && (
                <Button
                  type="button"
                  variant={assigneeId === currentMemberId ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setAssigneeId(currentMemberId)}
                >
                  {t('me')}
                </Button>
              )}
              {members
                .filter((m) => m.id !== currentMemberId)
                .map((member) => (
                  <Button
                    key={member.id}
                    type="button"
                    variant={assigneeId === member.id ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setAssigneeId(member.id)}
                  >
                    {member.displayName}
                  </Button>
                ))}
            </div>
          </div>

          {/* Due date */}
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-1.5">
              <Calendar className="w-4 h-4" />
              {t('whenToDo')}
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={quickDate === 'none' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleQuickDate('none')}
              >
                {t('noDueDate')}
              </Button>
              <Button
                type="button"
                variant={quickDate === 'today' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleQuickDate('today')}
              >
                {t('today')}
              </Button>
              <Button
                type="button"
                variant={quickDate === 'tomorrow' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleQuickDate('tomorrow')}
              >
                {t('tomorrow')}
              </Button>
              <Popover open={showCalendar} onOpenChange={setShowCalendar}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant={quickDate === 'custom' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setQuickDate('custom');
                      setShowCalendar(true);
                    }}
                  >
                    {quickDate === 'custom' && dueDate
                      ? format(dueDate, 'd MMM')
                      : t('date')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarPicker
                    mode="single"
                    selected={dueDate}
                    onSelect={(date) => {
                      setDueDate(date);
                      setShowCalendar(false);
                    }}
                    disabled={(date) => date < startOfToday()}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Priority */}
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-1.5">
              <Zap className="w-4 h-4" />
              {t('priority')}
            </label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={priority === 'normal' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPriority('normal')}
              >
                {t('normal')}
              </Button>
              <Button
                type="button"
                variant={priority === 'urgent' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPriority('urgent')}
                className={cn(
                  priority === 'urgent' && "bg-destructive hover:bg-destructive/90"
                )}
              >
                {t('urgent')}
              </Button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <Button
              variant="outline"
              className="flex-1"
              onClick={onClose}
              disabled={isSubmitting}
            >
              {t('cancel')}
            </Button>
            <Button
              className="flex-1"
              onClick={handleSubmit}
              disabled={!title.trim() || isSubmitting}
            >
              {isSubmitting ? t('saving') : t('save')}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
