
# RTL Layout Fixes Plan v2.2 ✅ COMPLETED

## Changes Made

All fixes applied to `src/pages/CalendarPage.tsx`:

1. ✅ **Reversed weekDays array for RTL** — `weekDaysBase` reversed via `[...weekDaysBase].reverse()` in RTL mode
2. ✅ **Removed `dir` from grids** — both week header and calendar grid no longer have `dir` attribute
3. ✅ **Added `rtl:flex-row-reverse` to month nav** — container now reverses flex direction in RTL
4. ✅ **Wrapped year in `<span dir="ltr">`** — year numbers stay LTR in RTL mode

## Other Files (Already Correct)

- `Today.tsx` — header has `rtl:flex-row-reverse`, button too
- `DiscussionsListPage.tsx` — header and New button correct
- `SettingsPage.tsx` — header correct
- `NewEntry.tsx` — back arrow swaps, header reverses

## Test Checklist

| Screen | Expected |
|--------|----------|
| Calendar | Weekdays: Sun Sat Fri Thu Wed Tue Mon (RTL reading order) |
| Calendar | Month nav with correct chevron positions |
| Calendar | Year "2026" stays LTR |
| Today | Consistent header layout |
| Discussions | Title + New button aligned correctly |

---

## Next Phase (Deferred)

- Spacing migration (`ml/mr → ms/me`)
- Hebrew/Arabic translations
