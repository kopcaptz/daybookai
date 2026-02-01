import { useState } from 'react';
import { Copy, Check, ListTodo, AlertTriangle, Clock, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';

export interface PlanItem {
  text: string;
  priority?: 'high' | 'medium' | 'low';
  dueHint?: string;
}

export interface PlanArtifactData {
  type: 'plan';
  title: string;
  items: PlanItem[];
}

interface PlanArtifactProps {
  artifact: PlanArtifactData;
}

const PRIORITY_ICONS = {
  high: Zap,
  medium: Clock,
  low: null,
};

const PRIORITY_COLORS = {
  high: 'text-destructive',
  medium: 'text-amber-500',
  low: 'text-muted-foreground',
};

export function PlanArtifact({ artifact }: PlanArtifactProps) {
  const { language } = useI18n();
  const [copied, setCopied] = useState(false);
  const [checkedItems, setCheckedItems] = useState<Set<number>>(new Set());
  
  const handleCopy = async () => {
    try {
      const text = `${artifact.title}\n\n${artifact.items.map((item, i) => 
        `${checkedItems.has(i) ? '✓' : '☐'} ${item.text}${item.priority === 'high' ? ' ⚡' : ''}${item.dueHint ? ` (${item.dueHint})` : ''}`
      ).join('\n')}`;
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(language === 'ru' ? 'План скопирован!' : 'Plan copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(language === 'ru' ? 'Ошибка копирования' : 'Failed to copy');
    }
  };
  
  const toggleItem = (index: number) => {
    setCheckedItems(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };
  
  const completedCount = checkedItems.size;
  const totalCount = artifact.items.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  
  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-primary/10 border-b border-primary/20">
        <div className="flex items-center gap-2">
          <ListTodo className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium text-primary">
            {language === 'ru' ? 'ПЛАН' : 'PLAN'}
          </span>
          <span className="text-xs text-muted-foreground">
            {completedCount}/{totalCount}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="h-7 text-xs gap-1.5 text-primary hover:text-primary"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" />
              {language === 'ru' ? 'Скопировано' : 'Copied'}
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              {language === 'ru' ? 'Копировать' : 'Copy'}
            </>
          )}
        </Button>
      </div>
      
      {/* Progress bar */}
      {totalCount > 0 && (
        <div className="h-1 bg-primary/10">
          <div 
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
      
      {/* Content */}
      <div className="p-3">
        {artifact.title && (
          <h4 className="font-medium text-foreground mb-3">{artifact.title}</h4>
        )}
        
        <ul className="space-y-2">
          {artifact.items.map((item, index) => {
            const PriorityIcon = item.priority ? PRIORITY_ICONS[item.priority] : null;
            const isChecked = checkedItems.has(index);
            
            return (
              <li key={index} className="flex items-start gap-3">
                <Checkbox
                  checked={isChecked}
                  onCheckedChange={() => toggleItem(index)}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <span className={cn(
                    "text-sm",
                    isChecked && "line-through text-muted-foreground"
                  )}>
                    {item.text}
                  </span>
                  <div className="flex items-center gap-2 mt-0.5">
                    {item.priority && PriorityIcon && (
                      <span className={cn(
                        "flex items-center gap-1 text-xs",
                        PRIORITY_COLORS[item.priority]
                      )}>
                        <PriorityIcon className="h-3 w-3" />
                        {item.priority === 'high' && (language === 'ru' ? 'срочно' : 'urgent')}
                      </span>
                    )}
                    {item.dueHint && (
                      <span className="text-xs text-muted-foreground">
                        {item.dueHint}
                      </span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
