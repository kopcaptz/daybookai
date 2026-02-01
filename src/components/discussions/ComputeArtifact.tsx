import { useState } from 'react';
import { Copy, Check, Calculator, ArrowRight, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export interface ComputeArtifactData {
  type: 'compute';
  inputs: { label: string; value: string }[];
  steps: string[];
  result: string;
  assumptions?: string[];
}

interface ComputeArtifactProps {
  artifact: ComputeArtifactData;
}

export function ComputeArtifact({ artifact }: ComputeArtifactProps) {
  const { language } = useI18n();
  const [copied, setCopied] = useState(false);
  
  const handleCopy = async () => {
    try {
      let text = '';
      if (artifact.inputs.length) {
        text += `${language === 'ru' ? 'Исходные данные:' : 'Inputs:'}\n${artifact.inputs.map(i => `${i.label}: ${i.value}`).join('\n')}\n\n`;
      }
      if (artifact.steps.length) {
        text += `${language === 'ru' ? 'Расчёт:' : 'Calculation:'}\n${artifact.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\n`;
      }
      text += `${language === 'ru' ? 'Результат:' : 'Result:'} ${artifact.result}`;
      if (artifact.assumptions?.length) {
        text += `\n\n${language === 'ru' ? 'Допущения:' : 'Assumptions:'}\n${artifact.assumptions.map(a => `• ${a}`).join('\n')}`;
      }
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(language === 'ru' ? 'Расчёт скопирован!' : 'Calculation copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(language === 'ru' ? 'Ошибка копирования' : 'Failed to copy');
    }
  };
  
  return (
    <div className="rounded-lg border border-accent/50 bg-accent/10 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-accent/20 border-b border-accent/30">
        <div className="flex items-center gap-2">
          <Calculator className="h-4 w-4 text-accent-foreground" />
          <span className="text-sm font-medium text-accent-foreground">
            {language === 'ru' ? 'РАСЧЁТ' : 'CALCULATION'}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="h-7 text-xs gap-1.5"
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
      
      {/* Content */}
      <div className="p-3 space-y-3">
        {/* Inputs */}
        {artifact.inputs.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {artifact.inputs.map((input, i) => (
              <div key={i} className="px-2 py-1 rounded bg-background/50 text-sm">
                <span className="text-muted-foreground">{input.label}:</span>{' '}
                <span className="font-mono font-medium">{input.value}</span>
              </div>
            ))}
          </div>
        )}
        
        {/* Steps */}
        {artifact.steps.length > 0 && (
          <div className="space-y-1.5 py-2 border-y border-accent/20">
            {artifact.steps.map((step, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <span className="shrink-0 w-5 h-5 rounded-full bg-accent/20 text-accent-foreground text-xs flex items-center justify-center font-medium">
                  {i + 1}
                </span>
                <span className="text-foreground/80 font-mono">{step}</span>
              </div>
            ))}
          </div>
        )}
        
        {/* Result */}
        <div className="flex items-center gap-2 p-2 rounded-lg bg-primary/10">
          <ArrowRight className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-medium text-primary">
            {language === 'ru' ? 'Результат:' : 'Result:'}
          </span>
          <span className="font-mono font-bold text-primary">{artifact.result}</span>
        </div>
        
        {/* Assumptions */}
        {artifact.assumptions && artifact.assumptions.length > 0 && (
          <div className="pt-2 border-t border-accent/20">
            <div className="flex items-center gap-1.5 mb-1">
              <Info className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                {language === 'ru' ? 'Допущения' : 'Assumptions'}
              </span>
            </div>
            <ul className="space-y-0.5">
              {artifact.assumptions.map((assumption, i) => (
                <li key={i} className="text-xs text-muted-foreground pl-4 relative before:absolute before:left-1 before:top-1.5 before:w-1 before:h-1 before:rounded-full before:bg-muted-foreground/50">
                  {assumption}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
