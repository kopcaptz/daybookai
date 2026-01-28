import { useState } from 'react';
import { Copy, Check, ChevronDown, ChevronUp, FileEdit } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface DraftArtifactProps {
  artifact: {
    type: string;
    title: string;
    body: string;
    format: 'markdown' | 'text';
  };
}

export function DraftArtifact({ artifact }: DraftArtifactProps) {
  const { t, language } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  
  const previewLength = 200;
  const needsExpand = artifact.body.length > previewLength;
  const displayText = expanded ? artifact.body : artifact.body.slice(0, previewLength);
  
  const handleCopy = async () => {
    try {
      const fullText = artifact.title 
        ? `${artifact.title}\n\n${artifact.body}`
        : artifact.body;
      await navigator.clipboard.writeText(fullText);
      setCopied(true);
      toast.success(language === 'ru' ? 'Скопировано!' : 'Copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(language === 'ru' ? 'Ошибка копирования' : 'Failed to copy');
    }
  };
  
  return (
    <div className="rounded-lg border border-cyber-sigil/30 bg-cyber-sigil/5 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-cyber-sigil/10 border-b border-cyber-sigil/20">
        <div className="flex items-center gap-2">
          <FileEdit className="h-4 w-4 text-cyber-sigil" />
          <span className="text-sm font-medium text-cyber-sigil">
            {artifact.type.toUpperCase()}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="h-7 text-xs gap-1.5 text-cyber-sigil hover:text-cyber-sigil"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" />
              {language === 'ru' ? 'Скопировано' : 'Copied'}
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              {t('discussion.copyDraft')}
            </>
          )}
        </Button>
      </div>
      
      {/* Content */}
      <div className="p-3">
        {artifact.title && (
          <h4 className="font-medium text-foreground mb-2">{artifact.title}</h4>
        )}
        <div className={cn(
          "text-sm text-foreground/90 whitespace-pre-wrap",
          artifact.format === 'markdown' && "prose prose-sm max-w-none"
        )}>
          {displayText}
          {!expanded && needsExpand && '...'}
        </div>
        
        {needsExpand && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="mt-2 h-7 text-xs gap-1"
          >
            {expanded ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" />
                {language === 'ru' ? 'Свернуть' : 'Collapse'}
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" />
                {language === 'ru' ? 'Развернуть' : 'Expand'}
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
