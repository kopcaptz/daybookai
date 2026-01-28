import { cn } from '@/lib/utils';
import { DiscussionMode } from '@/lib/librarian/contextPack';
import { useI18n } from '@/lib/i18n';
import { MessageSquare, BarChart3, FileEdit, Calculator, ListTodo } from 'lucide-react';

interface ModeSelectorProps {
  value: DiscussionMode;
  onChange: (mode: DiscussionMode) => void;
  disabled?: boolean;
}

const MODES: { mode: DiscussionMode; icon: typeof MessageSquare }[] = [
  { mode: 'discuss', icon: MessageSquare },
  { mode: 'analyze', icon: BarChart3 },
  { mode: 'draft', icon: FileEdit },
  { mode: 'compute', icon: Calculator },
  { mode: 'plan', icon: ListTodo },
];

export function ModeSelector({ value, onChange, disabled }: ModeSelectorProps) {
  const { t } = useI18n();
  
  return (
    <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-lg">
      {MODES.map(({ mode, icon: Icon }) => (
        <button
          key={mode}
          type="button"
          onClick={() => onChange(mode)}
          disabled={disabled}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            value === mode
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          )}
        >
          <Icon className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{t(`mode.${mode}`)}</span>
        </button>
      ))}
    </div>
  );
}

interface ModePillProps {
  mode: DiscussionMode;
}

export function ModePill({ mode }: ModePillProps) {
  const { t } = useI18n();
  
  const modeConfig = MODES.find(m => m.mode === mode);
  if (!modeConfig) return null;
  
  const Icon = modeConfig.icon;
  
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary text-xs font-medium rounded-full">
      <Icon className="h-3 w-3" />
      {t(`mode.${mode}`)}
    </span>
  );
}
