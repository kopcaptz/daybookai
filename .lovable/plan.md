
# План: Надёжный парсинг JSON в ai-biography с детекцией усечения

## Текущее состояние (строки 632-664)

```typescript
// Parse JSON from AI response
let biography: BiographyResponse;
try {
  // Extract JSON from potential markdown wrapper
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No JSON found in response");
  }
  const parsed = JSON.parse(jsonMatch[0]);
  // ...
} catch (parseError) {
  console.error({ requestId, action: "ai_biography_parse_error", error: String(parseError), content });
  return new Response(
    JSON.stringify({ error: "Failed to parse AI response", requestId }),
    { status: 500, headers: responseHeaders() }
  );
}
```

**Проблемы:**
- regex `\{[\s\S]*\}` жадный — захватывает мусор до/после JSON
- Если ответ усечён (токены закончились), `JSON.parse` падает без полезной диагностики
- Markdown wrapper (` ```json ``` `) не снимается
- Нет различия между truncated и syntax error

---

## Изменения

### 1. Увеличить maxTokens (строка 534)

```typescript
// Было:
const effectiveMaxTokens = Math.min(maxTokens || 2048, MAX_TOKENS_LIMIT);

// Станет:
const effectiveMaxTokens = Math.min(maxTokens || 3072, MAX_TOKENS_LIMIT);
```

---

### 2. Добавить extractJSON helper (после строки 216)

Вставить предоставленную тобой функцию `extractJSON` с полной диагностикой:

```typescript
// ============ JSON extraction with truncation detection ============

type ExtractJSONSuccess = { ok: true; value: unknown; jsonText: string };
type ExtractJSONFail = {
  ok: false;
  error: string;
  truncated: boolean;
  diagnostics: {
    contentLength: number;
    startsWithFence: boolean;
    endsWithFence: boolean;
    hasFenceAnywhere: boolean;
    braceBalance: number;
    bracketBalance: number;
    lastChar: string;
  };
};

const SUSPICIOUS_TAIL_CHARS = ['"', ',', ':', '[', '{', '\\'];

function extractJSON(content: string): ExtractJSONSuccess | ExtractJSONFail {
  const trimmed = content.trim();

  const startsWithFence = trimmed.startsWith("```");
  const endsWithFence = trimmed.endsWith("```");
  const hasFenceAnywhere = trimmed.includes("```");

  // Strip opening fence if present; strip closing only if it exists at the end.
  let cleaned = trimmed;
  if (startsWithFence) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").trim();
  }
  if (endsWithFence) {
    cleaned = cleaned.replace(/\n?```\s*$/, "").trim();
  }

  // Find JSON start: object or array (whichever appears first)
  const firstBrace = cleaned.indexOf("{");
  const firstBracket = cleaned.indexOf("[");
  if (firstBrace === -1 && firstBracket === -1) {
    return {
      ok: false,
      error: "No JSON object/array start found",
      truncated: false,
      diagnostics: {
        contentLength: content.length,
        startsWithFence,
        endsWithFence,
        hasFenceAnywhere,
        braceBalance: 0,
        bracketBalance: 0,
        lastChar: cleaned.slice(-1) || "",
      },
    };
  }

  const isObject =
    firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket);

  const jsonStart = isObject ? firstBrace : firstBracket;
  const jsonEnd = isObject ? cleaned.lastIndexOf("}") : cleaned.lastIndexOf("]");

  // If no closing token found, it's almost certainly truncated.
  if (jsonEnd <= jsonStart) {
    const tail = cleaned.trim().slice(-1);
    return {
      ok: false,
      error: "JSON appears truncated (no closing brace/bracket)",
      truncated: true,
      diagnostics: {
        contentLength: content.length,
        startsWithFence,
        endsWithFence,
        hasFenceAnywhere,
        braceBalance: 1,
        bracketBalance: 1,
        lastChar: tail,
      },
    };
  }

  const jsonText = cleaned.slice(jsonStart, jsonEnd + 1);

  // Balances (separate)
  const openBraces = (jsonText.match(/\{/g) || []).length;
  const closeBraces = (jsonText.match(/\}/g) || []).length;
  const openBrackets = (jsonText.match(/\[/g) || []).length;
  const closeBrackets = (jsonText.match(/\]/g) || []).length;
  const braceBalance = openBraces - closeBraces;
  const bracketBalance = openBrackets - closeBrackets;

  const lastChar = cleaned.trim().slice(-1);
  const suspiciousTail = SUSPICIOUS_TAIL_CHARS.includes(lastChar);

  // Parse first; decide truncated only if parse fails + heuristics suggest truncation
  try {
    return { ok: true, value: JSON.parse(jsonText), jsonText };
  } catch (e) {
    const unclosedFence = startsWithFence && !endsWithFence;
    const imbalanced = braceBalance !== 0 || bracketBalance !== 0;
    const likelyTruncated = unclosedFence || imbalanced || suspiciousTail;

    return {
      ok: false,
      error: String(e),
      truncated: likelyTruncated,
      diagnostics: {
        contentLength: content.length,
        startsWithFence,
        endsWithFence,
        hasFenceAnywhere,
        braceBalance,
        bracketBalance,
        lastChar,
      },
    };
  }
}
```

---

### 3. Добавить isValidBiographyShape (после extractJSON)

```typescript
function isValidBiographyShape(parsed: unknown): parsed is Record<string, unknown> {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return false;
  }
  
  const obj = parsed as Record<string, unknown>;
  
  // Must have narrative or story (string)
  const hasNarrative = typeof obj.narrative === "string" || typeof obj.story === "string";
  
  // highlights and timeline should be arrays if present
  const validHighlights = obj.highlights === undefined || Array.isArray(obj.highlights);
  const validTimeline = obj.timeline === undefined || Array.isArray(obj.timeline);
  
  // Basic timeline element validation
  if (Array.isArray(obj.timeline) && obj.timeline.length > 0) {
    const firstItem = obj.timeline[0];
    if (!firstItem || typeof firstItem !== "object") {
      return false;
    }
    const hasTimelineFields = "summary" in firstItem || "timeLabel" in firstItem;
    if (!hasTimelineFields) {
      return false;
    }
  }
  
  return hasNarrative && validHighlights && validTimeline;
}
```

---

### 4. Заменить блок парсинга (строки 632-664)

```typescript
// Parse JSON from AI response
let biography: BiographyResponse;

const parseResult = extractJSON(content);

if (!parseResult.ok) {
  const { error, truncated, diagnostics } = parseResult;
  
  console.error({
    requestId,
    action: truncated ? "ai_biography_truncated" : "ai_biography_parse_error",
    error,
    truncated,
    effectiveMaxTokens,
    model: effectiveModel,
    diagnostics,
    content_preview: content.slice(0, 500),
  });
  
  // 502 for truncation (upstream issue), 500 for parse error
  const httpStatus = truncated ? 502 : 500;
  const userMessage = truncated
    ? (language === "ru" 
        ? "Ответ AI был обрезан. Повторите попытку." 
        : "AI response was truncated. Please retry.")
    : (language === "ru"
        ? "Не удалось разобрать ответ AI"
        : "Failed to parse AI response");
  
  return new Response(
    JSON.stringify({ 
      error: userMessage, 
      errorCode: truncated ? "truncated" : "parse_error",
      requestId 
    }),
    { status: httpStatus, headers: responseHeaders() }
  );
}

// Validate structure
if (!isValidBiographyShape(parseResult.value)) {
  console.error({
    requestId,
    action: "ai_biography_invalid_schema",
    keys: Object.keys(parseResult.value as object),
    content_preview: content.slice(0, 500),
  });
  
  return new Response(
    JSON.stringify({ 
      error: language === "ru" 
        ? "AI вернул некорректную структуру" 
        : "AI returned invalid structure",
      errorCode: "invalid_schema",
      requestId 
    }),
    { status: 500, headers: responseHeaders() }
  );
}

const parsed = parseResult.value as Record<string, unknown>;

// Calculate confidence
const confidence = getConfidence(items.length);

biography = {
  title: (parsed.title as string) || (language === "ru" ? "Тихий день" : "A Quiet Day"),
  narrative: (parsed.narrative as string) || (parsed.story as string) || "",
  highlights: (parsed.highlights as string[]) || [],
  timeline: (parsed.timeline as Array<{timeLabel: string; summary: string}>) || [],
  meta: {
    model: effectiveModel,
    tokens: aiResponse.usage?.total_tokens,
    requestId,
    style: "daybook_biography_v2",
    confidence: (parsed.meta as Record<string, unknown>)?.confidence as "low" | "medium" | "high" || confidence,
  },
};
```

---

### 5. Улучшить лог успеха (строка 665)

```typescript
console.log({
  requestId,
  timestamp: new Date().toISOString(),
  action: "ai_biography_success",
  date,
  model: effectiveModel,
  effectiveMaxTokens,
  title_length: biography.title.length,
  narrative_length: biography.narrative.length,
  highlights_count: biography.highlights.length,
  timeline_count: biography.timeline.length,
  tokens_used: biography.meta.tokens,
  response_length: content.length,
});
```

---

## Файлы для изменения

| Файл | Изменения |
|------|-----------|
| `supabase/functions/ai-biography/index.ts` | +extractJSON, +isValidBiographyShape, maxTokens 3072, улучшенный парсинг |

---

## Ключевые улучшения

| Было | Стало |
|------|-------|
| Жадный regex `\{[\s\S]*\}` | Точный поиск first `{` → last `}` |
| Markdown wrapper не снимается | Снимается ` ```json ``` ` |
| Одна ошибка "Failed to parse" | Три разных: truncated, parse_error, invalid_schema |
| Нет диагностики | braceBalance, bracketBalance, lastChar, contentLength |
| maxTokens 2048 | maxTokens 3072 |
| HTTP 500 для всего | 502 для truncated, 500 для остального |

---

## Логика определения truncation

```text
1. Снять markdown fence (opening всегда, closing если есть)
2. Найти first { или [ и last } или ]
3. Если нет закрывающей → truncated = true
4. Иначе: извлечь jsonText, попробовать JSON.parse
   ✅ success → ok
   ❌ fail → определить truncated по:
      - unclosedFence (``` без закрытия)
      - imbalanced (braceBalance ≠ 0 или bracketBalance ≠ 0)
      - suspiciousTail (последний символ: ",:[{\\)
```

---

## Smoke-test

1. Открыть страницу "Сегодня" с записями
2. Нажать "Повторить" на карточке биографии
3. Проверить успешную генерацию
4. Если ошибка — проверить логи edge function:
   - `ai_biography_truncated` → повторить; если стабильно, увеличить maxTokens
   - `ai_biography_invalid_schema` → модель вернула не ту структуру
   - `ai_biography_parse_error` → синтаксическая ошибка в JSON
