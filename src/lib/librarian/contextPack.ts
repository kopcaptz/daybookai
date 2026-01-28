import { db, DiaryEntry, DiscussionMode } from '@/lib/db';
import { format } from 'date-fns';

// Re-export DiscussionMode for convenience
export type { DiscussionMode } from '@/lib/db';

// Evidence reference for AI citations
export interface EvidenceRef {
  type: 'entry' | 'document_page' | 'document';
  id: string;                   // Stable ref ID like "E1", "D2"
  title: string;
  subtitle?: string;            // Time/page/folder path
  snippet?: string;
  deepLink: string;             // /entry/:id or /documents/:id?page=N
  entityId: number;             // entryId or docId
  pageIndex?: number;
}

export interface ContextPackOptions {
  sessionScope: { entryIds: number[]; docIds: number[] };
  userQuery: string;
  mode: DiscussionMode;
  findMode: boolean;  // If true, search globally instead of using scope
}

export interface ContextPackResult {
  contextText: string;
  evidence: EvidenceRef[];
}

// Context limits
const CONTEXT_LIMITS = {
  maxEvidence: 8,
  maxSnippetChars: 600,
  maxTotalContextChars: 10000,
};

/**
 * Create a snippet from text, respecting character limit
 */
function createSnippet(text: string, maxChars: number = CONTEXT_LIMITS.maxSnippetChars): string {
  if (!text) return '';
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxChars) return cleaned;
  return cleaned.slice(0, maxChars - 3) + '...';
}

/**
 * Calculate simple keyword relevance score
 */
function calculateRelevanceScore(text: string, query: string): number {
  if (!query.trim()) return 0;
  const lowerText = text.toLowerCase();
  const keywords = query.toLowerCase().split(/\s+/).filter(k => k.length > 2);
  
  let score = 0;
  for (const keyword of keywords) {
    if (lowerText.includes(keyword)) {
      score += 1;
      // Bonus for exact word match
      const wordRegex = new RegExp(`\\b${keyword}\\b`, 'i');
      if (wordRegex.test(text)) {
        score += 0.5;
      }
    }
  }
  return score;
}

/**
 * Build entry title from date and time
 */
function buildEntryTitle(entry: DiaryEntry): string {
  const date = format(new Date(entry.date), 'dd.MM.yyyy');
  const time = format(new Date(entry.createdAt), 'HH:mm');
  return `${date} @ ${time}`;
}

/**
 * Get attachment count for privacy note
 */
async function getAttachmentCount(entryId: number): Promise<number> {
  return await db.attachments.where('entryId').equals(entryId).count();
}

/**
 * Build context pack from selected entries (standard mode)
 */
async function buildFromScope(
  entryIds: number[],
  query: string
): Promise<{ entries: DiaryEntry[]; scores: Map<number, number> }> {
  const entries: DiaryEntry[] = [];
  const scores = new Map<number, number>();
  
  for (const id of entryIds) {
    const entry = await db.entries.get(id);
    if (entry && !entry.isPrivate && entry.aiAllowed !== false) {
      entries.push(entry);
      const score = calculateRelevanceScore(entry.text + ' ' + entry.tags.join(' '), query);
      scores.set(entry.id!, score);
    }
  }
  
  // Sort by relevance (higher first), then by recency
  entries.sort((a, b) => {
    const scoreA = scores.get(a.id!) || 0;
    const scoreB = scores.get(b.id!) || 0;
    if (scoreA !== scoreB) return scoreB - scoreA;
    return b.createdAt - a.createdAt;
  });
  
  return { entries, scores };
}

/**
 * Build context pack from global search (find mode)
 */
async function buildFromSearch(
  query: string
): Promise<{ entries: DiaryEntry[]; scores: Map<number, number> }> {
  const allEntries = await db.entries.toArray();
  const scores = new Map<number, number>();
  
  // Filter and score entries
  const entries = allEntries
    .filter(entry => !entry.isPrivate && entry.aiAllowed !== false)
    .map(entry => {
      const score = calculateRelevanceScore(entry.text + ' ' + entry.tags.join(' '), query);
      scores.set(entry.id!, score);
      return { entry, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return b.entry.createdAt - a.entry.createdAt;
    })
    .slice(0, CONTEXT_LIMITS.maxEvidence * 2) // Get more for selection
    .map(({ entry }) => entry);
  
  return { entries, scores };
}

/**
 * Build context pack for discussion AI
 */
export async function buildContextPack(options: ContextPackOptions): Promise<ContextPackResult> {
  const { sessionScope, userQuery, findMode } = options;
  
  let entriesData: { entries: DiaryEntry[]; scores: Map<number, number> };
  
  if (findMode) {
    // Global search mode
    entriesData = await buildFromSearch(userQuery);
  } else {
    // Scope mode - use selected entries
    entriesData = await buildFromScope(sessionScope.entryIds, userQuery);
  }
  
  const { entries } = entriesData;
  const selectedEntries = entries.slice(0, CONTEXT_LIMITS.maxEvidence);
  
  const evidence: EvidenceRef[] = [];
  const contextParts: string[] = [];
  let totalChars = 0;
  
  for (let i = 0; i < selectedEntries.length; i++) {
    const entry = selectedEntries[i];
    const entryId = entry.id!;
    const refId = `E${i + 1}`;
    
    // Get attachment count for privacy note
    const attachmentCount = await getAttachmentCount(entryId);
    const attachmentNote = attachmentCount > 0 
      ? ` [MEDIA: ${attachmentCount} attachment(s) - not included]` 
      : '';
    
    // Build snippet
    const snippet = createSnippet(entry.text);
    const title = buildEntryTitle(entry);
    const subtitle = entry.tags.length > 0 ? entry.tags.join(', ') : undefined;
    
    // Add to evidence
    evidence.push({
      type: 'entry',
      id: refId,
      title,
      subtitle,
      snippet,
      deepLink: `/entry/${entryId}`,
      entityId: entryId,
    });
    
    // Build context text
    const contextEntry = `[${refId}] ${title}${subtitle ? ` | Tags: ${subtitle}` : ''}\n${snippet}${attachmentNote}`;
    
    // Check total char limit
    if (totalChars + contextEntry.length > CONTEXT_LIMITS.maxTotalContextChars) {
      break;
    }
    
    contextParts.push(contextEntry);
    totalChars += contextEntry.length;
  }
  
  const contextText = contextParts.join('\n\n---\n\n');
  
  return {
    contextText,
    evidence,
  };
}

/**
 * Get entries count text for scope display
 */
export function getScopeCountText(
  entryIds: number[],
  docIds: number[],
  language: 'ru' | 'en'
): string {
  const parts: string[] = [];
  
  if (entryIds.length > 0) {
    parts.push(language === 'ru' 
      ? `${entryIds.length} записей`
      : `${entryIds.length} entries`);
  }
  
  if (docIds.length > 0) {
    parts.push(language === 'ru'
      ? `${docIds.length} документов`
      : `${docIds.length} documents`);
  }
  
  if (parts.length === 0) {
    return language === 'ru' ? 'Нет источников' : 'No sources';
  }
  
  return parts.join(', ');
}
