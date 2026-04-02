import { Link } from 'react-router-dom';
import { FileText, ExternalLink, Book, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EvidenceRef } from '@/lib/librarian/contextPack';
import { useI18n } from '@/lib/i18n';

interface EvidenceCardProps {
  evidence: EvidenceRef;
  highlighted?: boolean;
}

function getEvidenceIcon(type: EvidenceRef['type']) {
  switch (type) {
    case 'entry':
      return FileText;
    case 'biography':
      return BookOpen;
    case 'document':
    case 'document_page':
    default:
      return Book;
  }
}

function getEvidenceClassLabel(evidence: EvidenceRef): string | null {
  switch (evidence.type) {
    case 'entry':
      return 'Diary entry';
    case 'biography':
      return 'Derived chronicle';
    default:
      return null;
  }
}

export function EvidenceCard({ evidence, highlighted = false }: EvidenceCardProps) {
  const { t } = useI18n();
  
  const Icon = getEvidenceIcon(evidence.type);
  const classLabel = getEvidenceClassLabel(evidence);
  
  return (
    <Link
      to={evidence.deepLink}
      className={cn(
        "flex items-start gap-2.5 p-2.5 rounded-lg border transition-all duration-200",
        "hover:border-cyber-sigil/40 hover:bg-cyber-sigil/5",
        highlighted 
          ? "border-cyber-sigil/30 bg-cyber-sigil/10" 
          : "border-border/50 bg-muted/30"
      )}
    >
      {/* Icon with ref ID */}
      <div className="flex items-center gap-1.5 shrink-0">
        <div className={cn(
          "flex items-center justify-center w-6 h-6 rounded text-xs font-mono font-medium",
          highlighted
            ? "bg-cyber-sigil/20 text-cyber-sigil"
            : "bg-muted text-muted-foreground"
        )}>
          {evidence.id}
        </div>
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      
      {/* Content */}
      <div className="flex-1 min-w-0">
        {classLabel && (
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/80 mb-1">
            {classLabel}
          </p>
        )}
        <p className="text-sm font-medium text-foreground truncate">
          {evidence.title}
        </p>
        {evidence.subtitle && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {evidence.subtitle}
          </p>
        )}
        {evidence.snippet && (
          <p className="text-xs text-muted-foreground/80 line-clamp-2 mt-1 leading-relaxed">
            {evidence.snippet}
          </p>
        )}
      </div>
      
      {/* Open indicator */}
      <ExternalLink className="h-3 w-3 text-muted-foreground/50 shrink-0 mt-0.5" />
    </Link>
  );
}

interface EvidenceListProps {
  evidence: EvidenceRef[];
  usedIds?: string[];
  maxVisible?: number;
}

interface EvidenceGroup {
  key: string;
  label: string;
  items: EvidenceRef[];
}

function buildEvidenceGroups(evidence: EvidenceRef[]): EvidenceGroup[] {
  const entries = evidence.filter(ev => ev.type === 'entry');
  const biographies = evidence.filter(ev => ev.type === 'biography');
  const other = evidence.filter(ev => ev.type !== 'entry' && ev.type !== 'biography');

  return [
    { key: 'entries', label: 'Diary entries', items: entries },
    { key: 'chronicles', label: 'Derived chronicles', items: biographies },
    { key: 'other', label: 'Other sources', items: other },
  ].filter(group => group.items.length > 0);
}

export function EvidenceList({ evidence, usedIds, maxVisible = 4 }: EvidenceListProps) {
  const { t } = useI18n();
  
  if (evidence.length === 0) return null;
  
  const groups = buildEvidenceGroups(evidence);
  let remaining = maxVisible;
  
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Evidence used ({evidence.length})
      </p>
      <div className="space-y-3">
        {groups.map((group) => {
          if (remaining <= 0) return null;

          const visibleItems = group.items.slice(0, remaining);
          const hiddenCount = group.items.length - visibleItems.length;
          remaining -= visibleItems.length;

          return (
            <div key={group.key} className="space-y-1.5">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">
                {group.label}
              </p>
              <div className="space-y-1.5">
                {visibleItems.map((ev) => (
                  <EvidenceCard 
                    key={ev.id} 
                    evidence={ev}
                    highlighted={usedIds?.includes(ev.id)}
                  />
                ))}
                {hiddenCount > 0 && (
                  <p className="text-xs text-muted-foreground text-center py-1">
                    +{hiddenCount} more
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
