import { db, DiaryEntry, DiscussionMode, StoredBiography } from '@/lib/db';
import { format } from 'date-fns';

// Re-export DiscussionMode for convenience
export type { DiscussionMode } from '@/lib/db';

// Evidence reference for AI citations
export interface EvidenceRef {
  type: 'entry' | 'document_page' | 'document' | 'biography';
  id: string;                   // Stable ref ID like "E1", "D2", "B1"
  title: string;
  subtitle?: string;            // Time/page/folder path
  snippet?: string;
  deepLink: string;             // /entry/:id or /documents/:id?page=N or /day/:date
  entityId: number;             // entryId or docId (0 for biographies)
  pageIndex?: number;
  biographyDate?: string;       // YYYY-MM-DD for biographies
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
  maxEvidence: 12,              // Increased to accommodate biographies
  maxBiographies: 4,            // Max chronicles per request
  maxSnippetChars: 600,
  maxTotalContextChars: 12000,  // Slightly increased for chronicles
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
 * Load relevant biographies for context
 */
async function loadRelevantBiographies(
  entryIds: number[],
  query: string,
  findMode: boolean
): Promise<StoredBiography[]> {
  const biographies: StoredBiography[] = [];
  const addedDates = new Set<string>();
  
  // 1. Get dates from selected entries (scope mode)
  if (!findMode && entryIds.length > 0) {
    const entries = await Promise.all(entryIds.map(id => db.entries.get(id)));
    const dates = [...new Set(entries.filter(Boolean).map(e => e!.date))];
    
    for (const date of dates) {
      const bio = await db.biographies.get(date);
      if (bio && bio.status === 'complete' && bio.biography) {
        biographies.push(bio);
        addedDates.add(bio.date);
      }
    }
  }
  
  // 2. Search by keywords (findMode or additional matches)
  if (query.trim()) {
    const allBios = await db.biographies.toArray();
    const matches = allBios.filter(bio => {
      if (bio.status !== 'complete' || !bio.biography) return false;
      if (addedDates.has(bio.date)) return false;
      
      const searchText = `${bio.biography.title} ${bio.biography.narrative} ${bio.biography.highlights.join(' ')}`;
      return calculateRelevanceScore(searchText, query) > 0;
    });
    
    // Sort by relevance
    matches.sort((a, b) => {
      const scoreA = calculateRelevanceScore(
        `${a.biography!.title} ${a.biography!.narrative}`,
        query
      );
      const scoreB = calculateRelevanceScore(
        `${b.biography!.title} ${b.biography!.narrative}`,
        query
      );
      return scoreB - scoreA;
    });
    
    for (const bio of matches) {
      if (!addedDates.has(bio.date)) {
        biographies.push(bio);
        addedDates.add(bio.date);
      }
    }
  }
  
  return biographies.slice(0, CONTEXT_LIMITS.maxBiographies);
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
  // Reserve slots for biographies
  const maxEntries = CONTEXT_LIMITS.maxEvidence - CONTEXT_LIMITS.maxBiographies;
  const selectedEntries = entries.slice(0, maxEntries);
  
  const evidence: EvidenceRef[] = [];
  const contextParts: string[] = [];
  let totalChars = 0;
  
  // Add entries to context
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
  
  // Load and add biographies
  const biographies = await loadRelevantBiographies(
    findMode ? [] : sessionScope.entryIds,
    userQuery,
    findMode
  );
  
  for (let i = 0; i < biographies.length; i++) {
    const bio = biographies[i];
    const refId = `B${i + 1}`;
    
    // Build biography snippet with title + narrative + highlights
    const bioContent = [
      bio.biography!.title,
      bio.biography!.narrative,
      'Ключевые моменты: ' + bio.biography!.highlights.slice(0, 3).join('; '),
    ].join('\n');
    
    const snippet = createSnippet(bioContent, CONTEXT_LIMITS.maxSnippetChars);
    
    // Format date for display
    const dateFormatted = format(new Date(bio.date), 'dd.MM.yyyy');
    
    evidence.push({
      type: 'biography',
      id: refId,
      title: `Хроника ${dateFormatted}`,
      subtitle: bio.biography!.title,
      snippet,
      deepLink: `/day/${bio.date}`,
      entityId: 0,
      biographyDate: bio.date,
    });
    
    // Build context text for biography
    const contextBio = `[${refId}] Chronicle ${bio.date}: ${bio.biography!.title}\n${snippet}`;
    
    // Check total char limit
    if (totalChars + contextBio.length > CONTEXT_LIMITS.maxTotalContextChars) {
      break;
    }
    
    contextParts.push(contextBio);
    totalChars += contextBio.length;
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
