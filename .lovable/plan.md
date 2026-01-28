
# Implementation Plan: Discussions Tab with Chat Sessions and Librarian Search

## Overview

This plan implements an end-to-end "Discuss selected sources" system for Cyber-Grimoire, adding a new Discussions tab that enables users to have AI-powered conversations grounded in their diary entries. The system includes local context retrieval (Librarian), multi-mode AI responses, and Evidence/Sources cards for transparent citation.

---

## Architecture Summary

```text
+------------------+     +-----------------------+     +-------------------+
|   Today Page     |     |  DiscussionChatPage   |     |  AI Edge Function |
|  (Entry Select)  |---->|  (Composer + Messages)|---->|  /ai-chat         |
+------------------+     +-----------------------+     +-------------------+
        |                         |                            ^
        v                         v                            |
+------------------+     +-----------------------+             |
| DiscussionsListPage|   | Librarian ContextPack |-------------+
|  (Session List)    |   | (Local Search)        |
+------------------+     +-----------------------+
        |                         |
        v                         v
+-------------------------------------------------------+
|                 Dexie IndexedDB                       |
| discussionSessions | discussionMessages | entries     |
+-------------------------------------------------------+
```

---

## A) Data Layer (Dexie) - New Tables

### New Types (src/lib/db.ts)

```typescript
// Discussion modes
export type DiscussionMode = 'discuss' | 'analyze' | 'draft' | 'compute' | 'plan';

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

// Discussion session
export interface DiscussionSession {
  id?: number;
  title: string;
  createdAt: number;
  updatedAt: number;
  lastMessageAt: number;
  scope: {
    entryIds: number[];
    docIds: number[];           // For future Documents module
  };
  modeDefault: DiscussionMode;
  pinned?: boolean;
}

// Discussion message
export interface DiscussionMessage {
  id?: number;
  sessionId: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: number;
  evidenceRefs?: EvidenceRef[];
  status?: 'ok' | 'error';
  meta?: {
    model?: string;
    tokens?: number;
    mode?: DiscussionMode;
    draftArtifact?: {
      type: string;
      title: string;
      body: string;
      format: 'markdown' | 'text';
    };
  };
}
```

### Database Version Upgrade

Bump from v9 to v10 with new tables:

```typescript
this.version(10).stores({
  // ... keep all existing stores ...
  discussionSessions: '++id, updatedAt, lastMessageAt, pinned',
  discussionMessages: '++id, sessionId, [sessionId+createdAt]',
});
```

### CRUD Functions

- `createDiscussionSession(session)` - Create new session
- `getDiscussionSessionById(id)` - Get single session
- `getAllDiscussionSessions()` - List all sessions (sorted by lastMessageAt desc)
- `updateDiscussionSession(id, updates)` - Update session
- `deleteDiscussionSession(id)` - Delete session and messages
- `addDiscussionMessage(message)` - Add message to session
- `getMessagesBySessionId(sessionId)` - Get all messages for session

---

## B) Navigation / Tabs

### BottomNav Update (src/components/BottomNav.tsx)

Add new tab between "Oracle" and "Settings":

```typescript
const navItems = [
  { path: '/', icon: Scroll, label: t('nav.today'), showBadge: true },
  { path: '/calendar', icon: Calendar, label: t('nav.calendar') },
  { path: '/new', icon: Feather, label: '', isCenter: true },
  { path: '/discussions', icon: MessageSquare, label: t('nav.discussions') }, // NEW
  { path: '/settings', icon: Settings, label: t('nav.settings') },
];
```

Remove the "/chat" (Oracle) tab from bottom nav since Discussions will replace it. Keep Oracle functionality accessible via a link in Discussions or Settings.

### Routing (src/App.tsx)

Add new routes:

```typescript
const DiscussionsListPage = lazy(() => import("./pages/DiscussionsListPage"));
const DiscussionChatPage = lazy(() => import("./pages/DiscussionChatPage"));

// Routes
<Route path="/discussions" element={<OnboardingGuard><DiscussionsListPage /></OnboardingGuard>} />
<Route path="/discussions/:id" element={<OnboardingGuard><DiscussionChatPage /></OnboardingGuard>} />
```

---

## C) UI Pages

### 1. DiscussionsListPage (/discussions)

**File:** `src/pages/DiscussionsListPage.tsx`

**Layout:**
- Header with brand + "New Discussion" button
- List of sessions with:
  - Title (truncated)
  - Last message timestamp
  - Scope counts ("3 entries, 2 docs")
  - Pin indicator
- Empty state with "Start a discussion" prompt

**Session Card Actions:**
- Tap to open `/discussions/:id`
- Long-press or swipe: Pin/Unpin, Delete (with confirmation)

### 2. DiscussionChatPage (/discussions/:id)

**File:** `src/pages/DiscussionChatPage.tsx`

**Layout:**
- **Header:** Back button, editable title, mode selector, "Context" drawer button
- **Context Drawer (Sheet):** Shows selected entries/docs with "Add from Today" button
- **Messages Area:** User + assistant messages with Evidence cards
- **Composer:** Textarea, Send button, mode pills, "Find in notes" toggle

**Mode Selector:**
Pill-style buttons for: Discuss | Analyze | Draft | Compute | Plan

**Evidence Cards Component:**
Reusable `<EvidenceCard>` component:
- Shows source type icon, title, subtitle, snippet preview
- "Open" button with deep link navigation
- Grouped in collapsible "Sources (N)" section

**Composer Features:**
- Multi-line textarea with auto-resize
- Send button (disabled when empty or loading)
- Mode indicator showing current mode
- Optional "Find in notes" toggle that enables global search mode

---

## D) Context Pack Builder (Librarian)

**File:** `src/lib/librarian/contextPack.ts`

### Core Function

```typescript
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

export async function buildContextPack(options: ContextPackOptions): Promise<ContextPackResult>
```

### Retrieval Logic

**Standard Mode (findMode=false):**
1. Fetch entries by IDs from sessionScope.entryIds
2. Filter: `!isPrivate && aiAllowed !== false`
3. Score by relevance to userQuery (keyword matching)
4. Take top 8 items
5. Build snippet (max 600 chars per item)
6. Generate EvidenceRefs with stable IDs (E1, E2, ...)

**Find Mode (findMode=true):**
1. Run global search across all entries
2. Match userQuery keywords against entry.text and entry.tags
3. Take top 8 hits
4. Build snippets + EvidenceRefs

### Context Limits

```typescript
const CONTEXT_LIMITS = {
  maxEvidence: 8,
  maxSnippetChars: 600,
  maxTotalContextChars: 10000,
};
```

### Privacy Pipeline

Never send raw blobs. For entries with attachments:
```typescript
const attachmentNote = attachmentCount > 0 
  ? ` [MEDIA: ${attachmentCount} attachment(s) - not included]` 
  : '';
```

---

## E) AI Integration

**File:** `src/lib/ai/discussions.ts`

### sendDiscussionMessage Function

```typescript
export interface DiscussionAIRequest {
  sessionId: number;
  userText: string;
  mode: DiscussionMode;
  contextPack: ContextPackResult;
  history: DiscussionMessage[];
}

export interface DiscussionAIResponse {
  answer: string;
  usedEvidenceIds: string[];
  draftArtifact?: {
    type: string;
    title: string;
    body: string;
    format: 'markdown' | 'text';
  };
  questions?: string[];
}

export async function sendDiscussionMessage(request: DiscussionAIRequest): Promise<DiscussionAIResponse>
```

### System Prompt Template

```typescript
const DISCUSSION_SYSTEM_PROMPT = `You are Cyber-Grimoire assistant for the Discussions feature.

RULES:
1. Use ONLY the provided CONTEXT. Do not invent facts.
2. Cite sources using evidence IDs like [E1], [E2]
3. NEVER quote entries verbatim - paraphrase only
4. Match the user's language (Russian or English)
5. Keep responses focused and helpful

CONTEXT:
{contextText}

MODE: {mode}
- discuss: Explore ideas, ask clarifying questions
- analyze: Structure, causes, risks, conclusions
- draft: Produce clean text draft with title and body
- compute: Show calculation steps and assumptions
- plan: Step-by-step plan with checklist

RESPONSE FORMAT (JSON):
{
  "answer": "Your response text with [E1] citations",
  "usedEvidenceIds": ["E1", "E2"],
  "draftArtifact": null | { "type": "...", "title": "...", "body": "...", "format": "markdown" },
  "questions": [] | ["Clarifying question 1"]
}`;
```

### Streaming Integration

Use existing `streamChatCompletion` from aiService.ts with modified messages:
1. Build system prompt with context
2. Include last N (e.g., 10) session messages as history
3. Parse response for JSON; fallback to plain text if parsing fails

---

## F) Draft Artifacts (MVP)

Store draftArtifact in `DiscussionMessage.meta` field.

**UI for Drafts:**
- When message has `meta.draftArtifact`, show special card:
  - Title of draft
  - Preview of body (first 200 chars)
  - "Copy to Clipboard" button
  - "Expand" to show full markdown

---

## G) Start Discussion from Today

### Today Page Enhancements (src/pages/Today.tsx)

**Multi-Select Mode:**
1. Add "Select" button in header OR enter via long-press on entry
2. Show checkboxes on entry cards
3. Floating action bar at bottom: "Discuss (N)" button
4. On tap "Discuss":
   - Create new DiscussionSession with scope.entryIds = selected
   - Navigate to `/discussions/:id`
   - Clear selection

**State:**
```typescript
const [selectionMode, setSelectionMode] = useState(false);
const [selectedEntryIds, setSelectedEntryIds] = useState<Set<number>>(new Set());
```

**EntryCard Enhancement:**
Add optional `selectable` and `selected` props for checkbox display.

---

## H) Deep Links (Evidence Cards)

### Entry Deep Links
Format: `/entry/:id`
- Already supported by existing routing

### Query Parameter for Scroll
Optional enhancement: `/entry/:id?highlight=true` to scroll to entry

---

## I) Internationalization

### New Translation Keys

```typescript
// Navigation
'nav.discussions': { ru: 'Обсуждения', en: 'Discussions' },

// Discussions List
'discussions.title': { ru: 'Обсуждения', en: 'Discussions' },
'discussions.new': { ru: 'Новое', en: 'New' },
'discussions.empty': { ru: 'Нет обсуждений', en: 'No discussions' },
'discussions.emptyHint': { ru: 'Выберите записи и начните обсуждение', en: 'Select entries and start discussing' },
'discussions.scopeEntries': { ru: 'записей', en: 'entries' },
'discussions.scopeDocs': { ru: 'документов', en: 'documents' },
'discussions.delete': { ru: 'Удалить', en: 'Delete' },
'discussions.deleteConfirm': { ru: 'Удалить обсуждение?', en: 'Delete discussion?' },
'discussions.pin': { ru: 'Закрепить', en: 'Pin' },
'discussions.unpin': { ru: 'Открепить', en: 'Unpin' },

// Discussion Chat
'discussion.context': { ru: 'Контекст', en: 'Context' },
'discussion.addFromToday': { ru: 'Добавить из записей', en: 'Add from entries' },
'discussion.sources': { ru: 'Источники', en: 'Sources' },
'discussion.openSource': { ru: 'Открыть', en: 'Open' },
'discussion.findInNotes': { ru: 'Найти в записях', en: 'Find in notes' },
'discussion.offline': { ru: 'Офлайн: ИИ недоступен', en: 'Offline: AI unavailable' },
'discussion.loadingContext': { ru: 'Загрузка контекста...', en: 'Loading context...' },
'discussion.copyDraft': { ru: 'Скопировать', en: 'Copy' },
'discussion.placeholder': { ru: 'Спросите о выбранных записях...', en: 'Ask about selected entries...' },

// Modes
'mode.discuss': { ru: 'Обсудить', en: 'Discuss' },
'mode.analyze': { ru: 'Анализ', en: 'Analyze' },
'mode.draft': { ru: 'Черновик', en: 'Draft' },
'mode.compute': { ru: 'Расчёт', en: 'Compute' },
'mode.plan': { ru: 'План', en: 'Plan' },

// Selection
'today.select': { ru: 'Выбрать', en: 'Select' },
'today.cancel': { ru: 'Отмена', en: 'Cancel' },
'today.discuss': { ru: 'Обсудить', en: 'Discuss' },
```

---

## Files to Create/Modify

### New Files
| File | Purpose |
|------|---------|
| `src/pages/DiscussionsListPage.tsx` | Sessions list page |
| `src/pages/DiscussionChatPage.tsx` | Chat interface page |
| `src/lib/librarian/contextPack.ts` | Local context retrieval |
| `src/lib/ai/discussions.ts` | Discussion AI integration |
| `src/components/discussions/SessionCard.tsx` | Session list item |
| `src/components/discussions/EvidenceCard.tsx` | Source citation card |
| `src/components/discussions/ModeSelector.tsx` | Mode pill buttons |
| `src/components/discussions/ContextDrawer.tsx` | Context scope drawer |
| `src/components/discussions/DraftArtifact.tsx` | Draft display component |

### Modified Files
| File | Changes |
|------|---------|
| `src/lib/db.ts` | Add types + tables + CRUD (v10) |
| `src/lib/i18n.tsx` | Add translation keys |
| `src/components/BottomNav.tsx` | Add Discussions tab |
| `src/App.tsx` | Add routes, update hideNav |
| `src/pages/Today.tsx` | Add multi-select mode |
| `src/components/EntryCard.tsx` | Add selectable prop |

---

## Technical Details

### Context Pack Limits
- Max evidence items: 8
- Max snippet length: 600 characters
- Max total context: 10,000 characters

### Message History Limit
Send last 10 messages to AI (plus system prompt and current user message)

### AI Response Parsing
```typescript
try {
  const parsed = JSON.parse(responseText);
  return {
    answer: parsed.answer,
    usedEvidenceIds: parsed.usedEvidenceIds || [],
    draftArtifact: parsed.draftArtifact || null,
    questions: parsed.questions || [],
  };
} catch {
  // Fallback: treat entire response as answer, use all evidence
  return {
    answer: responseText,
    usedEvidenceIds: contextPack.evidence.map(e => e.id),
    draftArtifact: null,
    questions: [],
  };
}
```

### Privacy Guarantees
1. Never send blob data to AI
2. Never send raw entry text - only summaries/themes for context
3. Attachment presence is noted but content excluded
4. Private entries excluded from search

---

## Demo Flow

1. Open Today page with several entries
2. Tap "Select" button in header
3. Select 3-4 entries using checkboxes
4. Tap "Discuss (3)" floating button
5. New session created and chat opens
6. Ask: "What patterns do you see in these entries?"
7. AI responds with analysis + Evidence cards
8. Tap Evidence card "Open" to navigate to source entry
9. Return to chat, toggle "Find in notes"
10. Ask: "Search for entries about work stress"
11. AI finds relevant entries globally, cites them
12. Switch to "Draft" mode
13. Ask: "Write a summary email about my week"
14. AI returns draft artifact with "Copy" button

---

## Known Limitations / Deferred to Next Steps

1. **Documents module** - Referenced but not implemented. docIds in scope will be empty until Documents feature is built
2. **Add from Documents** button will be a stub/disabled
3. **Media analysis** - Explicitly out of scope; attachments noted but not analyzed
4. **Calendar/reminder creation** from discussions - deferred to Step 14
5. **Embeddings/semantic search** - Using keyword matching only for now
6. **Session sharing/export** - Not included in this step

---

## Acceptance Checklist

- [ ] Tab "Discussions" exists in bottom nav and shows sessions list
- [ ] From Today: select 2-5 entries and "Discuss (N)" creates session + opens chat
- [ ] Sending message builds ContextPack from selected entries
- [ ] AI response shows Evidence/Sources cards with deep links
- [ ] "Find in notes" toggle enables global search across entries
- [ ] Draft mode returns clean draft text with "Copy" button
- [ ] Messages persist in Dexie and survive page reload
- [ ] Privacy: verify payload contains only text snippets, no blobs
- [ ] Modes work: Discuss, Analyze, Draft, Compute, Plan
- [ ] i18n: All strings translated for RU/EN
