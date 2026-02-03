
# RTL Layout Fixes Plan v2.2

## Root Cause Analysis

Based on the screenshots and code review, the current implementation has these bugs:

| Bug | Location | Cause | Fix |
|-----|----------|-------|-----|
| Calendar shows "Su Sa Fr Th We Tu Mo" (mirrored) | `CalendarPage.tsx:184,194` | Using `dir="rtl"` on grid containers | Remove `dir` attr, reverse weekDays array instead |
| Month nav buttons in wrong position | `CalendarPage.tsx:162` | Missing container-level row reverse | Add `rtl:flex-row-reverse` |
| Today header jumps between screenshots | `Today.tsx:172` | Already has fix, but button needs `rtl:flex-row-reverse` too | Verify button styling |
| Year numbers should stay LTR | `CalendarPage.tsx:167` | No `dir="ltr"` wrapping | Wrap year in `<span dir="ltr">` |

## Step 1: Calendar Weekday Headers (Data-Level Fix)

**Problem:** `dir="rtl"` on grid visually reverses columns, creating "Su Sa Fr Th We Tu Mo".

**Solution:** Remove `dir` attributes from grids. Instead, reverse the weekDays array in RTL mode.

```tsx
// CalendarPage.tsx - lines 117-125
// CURRENT (wrong):
const weekDays = [
  t('calendar.mon'), t('calendar.tue'), t('calendar.wed'), 
  t('calendar.thu'), t('calendar.fri'), t('calendar.sat'), t('calendar.sun'),
];

// NEW (correct):
const weekDaysBase = [
  t('calendar.mon'), t('calendar.tue'), t('calendar.wed'), 
  t('calendar.thu'), t('calendar.fri'), t('calendar.sat'), t('calendar.sun'),
];
const weekDays = isRTL(language) ? [...weekDaysBase].reverse() : weekDaysBase;
```

**Remove `dir` from grids:**
- Line 184: Remove `dir={isRTL(language) ? 'rtl' : 'ltr'}` from week header grid
- Line 194: Remove `dir={isRTL(language) ? 'rtl' : 'ltr'}` from calendar grid

## Step 2: Calendar Month Navigation

**Problem:** Chevron buttons stay in LTR order despite icon swap.

**Solution:** Add `rtl:flex-row-reverse` to month nav container.

```tsx
// CalendarPage.tsx - line 162
// CURRENT:
<div className="flex items-center justify-between">

// NEW:
<div className="flex items-center justify-between rtl:flex-row-reverse">
```

**Keep existing icon swap** (already correct at lines 159-160):
```tsx
const PrevIcon = isRTL(language) ? ChevronRight : ChevronLeft;
const NextIcon = isRTL(language) ? ChevronLeft : ChevronRight;
```

## Step 3: LTR Numbers/Dates

**Problem:** Year "2026" should stay LTR in RTL mode.

**Solution:** Wrap year in `<span dir="ltr">`:

```tsx
// CalendarPage.tsx - line 167
// CURRENT:
{getMonthName(currentMonth)} {currentMonth.getFullYear()}

// NEW:
{getMonthName(currentMonth)} <span dir="ltr">{currentMonth.getFullYear()}</span>
```

## Step 4: Today Page Consistency

The Today page already has `rtl:flex-row-reverse` on line 172. Verify:

1. Header container has the class
2. Reminder button has `rtl:flex-row-reverse` for icon+text (line 187 - already present)

**No changes needed if already correct.**

## Step 5: Discussions Header

Line 71 already has `rtl:flex-row-reverse`. Verify New button (line 87) also has it for icon+text.

**Already present - no changes needed.**

## Step 6: Settings Header

Line 179 already has `rtl:flex-row-reverse`.

**No changes needed.**

## Step 7: NewEntry Page

Lines 559-568 already have proper RTL handling:
- Header has `rtl:flex-row-reverse`
- BackIcon swaps between ArrowRight/ArrowLeft

**No changes needed.**

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/CalendarPage.tsx` | 1. Reverse weekDays array for RTL 2. Remove `dir` from grids 3. Add `rtl:flex-row-reverse` to month nav 4. Wrap year in `<span dir="ltr">` |

**All other files already have correct RTL handling.**

---

## What We Are NOT Doing

- No spacing migration (`ml/mr → ms/me`) - deferred to next phase
- No translation additions - deferred
- No changes to business logic (weekStartsOn remains Monday-first)

---

## Test Checklist (Must Pass in Hebrew)

| Screen | Expected Behavior |
|--------|-------------------|
| Calendar | Weekdays show: Mo Tu We Th Fr Sa Su (left-to-right, reversed array means RTL reading order is correct) |
| Calendar | Month nav: ← Feb 2026 → with correct chevron directions |
| Calendar | Year "2026" displays as LTR numbers |
| Calendar | Clicking on day 3 navigates to Feb 3 (not a different day) |
| Today | Date left, Reminder button right (consistent, no jumping) |
| Discussions | Title left, +New button right |
| Settings | Grimoire icon left, empty spacer right |
| NewEntry | Back arrow points right (→), title center, save/delete right |
