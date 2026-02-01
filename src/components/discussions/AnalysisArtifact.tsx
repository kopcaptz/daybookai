import { useState } from 'react';
import { Copy, Check, BarChart3, Lightbulb, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export interface AnalysisArtifactData {
  type: 'analysis';
  summary: string;
  patterns?: string[];
  risks?: string[];
  conclusions?: string[];
}

interface AnalysisArtifactProps {
  artifact: AnalysisArtifactData;
}

export function AnalysisArtifact({ artifact }: AnalysisArtifactProps) {
  const { language } = useI18n();
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(true);
  
  const handleCopy = async () => {
    try {
      let text = artifact.summary;
      if (artifact.patterns?.length) {
        text += `\n\n${language === 'ru' ? 'Закономерности:' : 'Patterns:'}\n${artifact.patterns.map(p => `• ${p}`).join('\n')}`;
      }
      if (artifact.risks?.length) {
        text += `\n\n${language === 'ru' ? 'Риски:' : 'Risks:'}\n${artifact.risks.map(r => `• ${r}`).join('\n')}`;
      }
      if (artifact.conclusions?.length) {
        text += `\n\n${language === 'ru' ? 'Выводы:' : 'Conclusions:'}\n${artifact.conclusions.map(c => `• ${c}`).join('\n')}`;
      }
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(language === 'ru' ? 'Анализ скопирован!' : 'Analysis copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(language === 'ru' ? 'Ошибка копирования' : 'Failed to copy');
    }
  };
  
  const hasContent = artifact.patterns?.length || artifact.risks?.length || artifact.conclusions?.length;
  
  return (
    <div className="rounded-lg border border-secondary/50 bg-secondary/10 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-secondary/20 border-b border-secondary/30">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-secondary-foreground" />
          <span className="text-sm font-medium text-secondary-foreground">
            {language === 'ru' ? 'АНАЛИЗ' : 'ANALYSIS'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {hasContent && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
              className="h-7 w-7 p-0"
            >
              {expanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          )}
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
      </div>
      
      {/* Content */}
      <div className="p-3 space-y-3">
        {/* Summary */}
        <p className="text-sm text-foreground">{artifact.summary}</p>
        
        {expanded && hasContent && (
          <div className="space-y-3 pt-2 border-t border-secondary/20">
            {/* Patterns */}
            {artifact.patterns && artifact.patterns.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
                  <span className="text-xs font-medium text-amber-600">
                    {language === 'ru' ? 'Закономерности' : 'Patterns'}
                  </span>
                </div>
                <ul className="space-y-1">
                  {artifact.patterns.map((pattern, i) => (
                    <li key={i} className="text-sm text-foreground/80 pl-5 relative before:absolute before:left-1 before:top-2 before:w-1.5 before:h-1.5 before:rounded-full before:bg-amber-500/50">
                      {pattern}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {/* Risks */}
            {artifact.risks && artifact.risks.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                  <span className="text-xs font-medium text-destructive">
                    {language === 'ru' ? 'Риски' : 'Risks'}
                  </span>
                </div>
                <ul className="space-y-1">
                  {artifact.risks.map((risk, i) => (
                    <li key={i} className="text-sm text-foreground/80 pl-5 relative before:absolute before:left-1 before:top-2 before:w-1.5 before:h-1.5 before:rounded-full before:bg-destructive/50">
                      {risk}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {/* Conclusions */}
            {artifact.conclusions && artifact.conclusions.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                  <span className="text-xs font-medium text-green-600">
                    {language === 'ru' ? 'Выводы' : 'Conclusions'}
                  </span>
                </div>
                <ul className="space-y-1">
                  {artifact.conclusions.map((conclusion, i) => (
                    <li key={i} className="text-sm text-foreground/80 pl-5 relative before:absolute before:left-1 before:top-2 before:w-1.5 before:h-1.5 before:rounded-full before:bg-green-500/50">
                      {conclusion}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
