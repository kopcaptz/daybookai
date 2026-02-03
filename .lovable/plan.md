
# Fix OnboardingPage Crash for Hebrew/Arabic Languages

## Problem

The onboarding page crashes with `TypeError: Cannot read properties of undefined (reading 'length')` when the language is set to Hebrew (`he`) or Arabic (`ar`).

**Root cause:** The `slides` and `labels` objects in `OnboardingPage.tsx` only have keys for `'ru'` and `'en'`, but the `Language` type now includes `'he'` and `'ar'`.

```tsx
// Current state - causes crash
const currentSlides = slides[language]; // slides['he'] → undefined
const isLastSlide = currentSlide === currentSlides.length - 1; // undefined.length → CRASH
```

---

## Solution

Add Hebrew (`he`) and Arabic (`ar`) translations to the `slides` and `labels` objects, with English as the base translation (can be localized later).

---

## Changes

### File: `src/pages/OnboardingPage.tsx`

**1. Add Hebrew and Arabic slides (lines 17-54)**

```tsx
const slides = {
  ru: [...], // existing
  en: [...], // existing
  he: [
    { title: 'ברוכים הבאים', body: 'Magic Notebook הוא יומן עם הנחיות AI עדינות לכל יום.' },
    { title: 'היום הוא המרכז שלך', body: 'בהיום תראו את הרשומות והתזכורות שלכם.' },
    { title: 'רשומות ולוח שנה', body: 'צרו רשומות במהירות, ולוח השנה עוזר לראות את הקצב והמצב רוח.' },
    { title: 'פרטיות ושליטה', body: 'הנתונים שלכם נשמרים מקומית. שפה וערכת נושא בהגדרות.' },
  ],
  ar: [
    { title: 'مرحباً', body: 'دفتر الملاحظات السحري هو يوميات مع تلميحات ذكاء اصطناعي لكل يوم.' },
    { title: 'اليوم هو مركزك', body: 'في اليوم سترى مدخلاتك والتذكيرات.' },
    { title: 'المدخلات والتقويم', body: 'أنشئ مدخلات بسرعة، والتقويم يساعدك على رؤية إيقاعك ومزاجك.' },
    { title: 'الخصوصية والتحكم', body: 'بياناتك تبقى محلية. اللغة والمظهر في الإعدادات.' },
  ],
};
```

**2. Add Hebrew and Arabic labels (lines 56-73)**

```tsx
const labels = {
  ru: {...}, // existing
  en: {...}, // existing
  he: {
    skip: 'דלג',
    next: 'הבא',
    back: 'חזרה',
    start: 'התחל',
    openSettings: 'פתח הגדרות',
    themeTitle: 'ערכת נושא',
  },
  ar: {
    skip: 'تخطي',
    next: 'التالي',
    back: 'رجوع',
    start: 'ابدأ',
    openSettings: 'فتح الإعدادات',
    themeTitle: 'المظهر',
  },
};
```

**3. Update theme option labels (line 358)**

Currently uses `language === 'ru'` check which won't work for Hebrew/Arabic:

```tsx
// Current
{language === 'ru' ? opt.labelRu : opt.labelEn}

// Fixed - use getBaseLanguage helper
{getBaseLanguage(language) === 'ru' ? opt.labelRu : opt.labelEn}
```

**4. Update slide navigation aria-labels (line 388)**

```tsx
// Current
aria-label={language === 'ru' ? `Перейти к слайду ${index + 1}` : `Go to slide ${index + 1}`}

// Fixed
aria-label={getBaseLanguage(language) === 'ru' ? `Перейти к слайду ${index + 1}` : `Go to slide ${index + 1}`}
```

**5. Add import for getBaseLanguage (line 5)**

```tsx
import { useI18n, getBaseLanguage } from '@/lib/i18n';
```

---

## Why This Fix Works

1. **Immediate crash fix**: Adding `he` and `ar` keys to both objects ensures `slides[language]` always returns an array
2. **Native RTL content**: Hebrew and Arabic slides are written in their native scripts, which will display correctly with the RTL infrastructure already in place
3. **Fallback pattern**: For theme labels and aria-labels, we use `getBaseLanguage()` to map `he`/`ar` → `en` for localization we don't have yet

---

## Test Plan

1. Set language to Hebrew (עברית) in Settings
2. Clear localStorage `daybook-onboarded` flag or use incognito
3. Navigate to `/onboarding`
4. Verify:
   - [ ] Page loads without error
   - [ ] Hebrew content displays correctly
   - [ ] Text is right-aligned (RTL)
   - [ ] Navigation buttons work
   - [ ] Theme selector works
5. Repeat for Arabic (العربية)
