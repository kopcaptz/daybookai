

# Активная иконка книги: Варианты реализации

## Текущее состояние

На скриншоте видно:
- Центральный сигил (книга) в стеклянном контейнере с orbital particles
- Текст "Открой день" и AI-шёпот
- Подсказка "Нажми +, чтобы добавить первую запись"

**Проблема:** Сигил — очевидная точка фокуса, но не кликабельный. Пользователи интуитивно хотят нажать на него.

---

## 3 Варианта реализации

### Вариант 1: Простой клик с Hero-переходом (Рекомендуется)

**Суть:** Сигил становится кликабельной областью, использующей уже готовую Hero-анимацию.

```text
┌─────────────────────────────────────┐
│                                     │
│      ╔═══════════════╗              │
│      ║   [SIGIL]     ║ ← КЛИКАБЕЛЬНО│
│      ╚═══════════════╝              │
│                                     │
│        "Открой день"                │
│                                     │
│   Нажми на книгу или +              │ ← Обновить текст
└─────────────────────────────────────┘
```

**Изменения:**
- `BreathingSigil`: добавить `onClick` prop + cursor-pointer + hover эффекты
- `Today.tsx`: передать обработчик, использующий `useHeroTransition`
- Обновить подсказку: "Нажми на книгу или +"

**Преимущества:**
- Минимум кода
- Использует готовую анимацию
- Консистентный UX с кнопкой +

---

### Вариант 2: "Открытие книги" — альтернативная анимация

**Суть:** При клике на сигил — уникальная анимация "раскрытия страниц", отличная от кнопки +.

```text
Фаза 1: Книга "оживает" (scale 1.1, glow усиливается)
     ↓
Фаза 2: Страницы "разлетаются" (частицы расходятся)
     ↓
Фаза 3: Fade to white → NewEntry появляется
```

**Изменения:**
- Новые keyframes: `book-open`, `pages-scatter`
- `BreathingSigil`: локальное состояние анимации
- Отдельный transition эффект (не через HeroTransition)

**Преимущества:**
- Уникальный "магический" опыт
- Дифференциация от кнопки +
- Больше ощущения "открытия гримуара"

**Недостатки:**
- Больше кода
- Нужно поддерживать 2 типа перехода

---

### Вариант 3: Весь Empty State — кликабельная область

**Суть:** Любой клик в области empty state ведёт к созданию записи.

```text
┌─────────────────────────────────────┐
│ ┌─────────────────────────────────┐ │
│ │                                 │ │
│ │      [SIGIL]                    │ │
│ │      "Открой день"              │ │ ← ВСЯ ОБЛАСТЬ
│ │      Oracle whisper             │ │   КЛИКАБЕЛЬНА
│ │                                 │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

**Изменения:**
- Обернуть весь empty state в `<button>` или div с onClick
- Добавить hover-эффект на всю область
- Изменить подсказку: "Нажми куда угодно, чтобы начать"

**Преимущества:**
- Максимальная доступность
- Невозможно промахнуться

**Недостатки:**
- Менее "магично", слишком просто
- Нет визуального фокуса

---

## Рекомендация: Вариант 1 + элементы из Вариант 2

Сделать сигил кликабельным с Hero-переходом, но добавить микро-анимацию на hover:

1. **Hover:** orbital particles ускоряются, glow усиливается
2. **Click:** haptic → ritual event → Hero transition
3. **Accessibility:** cursor-pointer, focus ring, aria-label

---

## Технические изменения

### Файл: `src/components/icons/BreathingSigil.tsx`

Добавить интерактивность:

```tsx
interface BreathingSigilProps {
  className?: string;
  ritualActive?: boolean;
  onClick?: () => void;        // NEW
  interactive?: boolean;        // NEW
}

export function BreathingSigil({ 
  className, 
  ritualActive = false,
  onClick,
  interactive = false 
}: BreathingSigilProps) {
  const [isHovered, setIsHovered] = useState(false);
  
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      disabled={!interactive}
      aria-label="Создать запись"
      className={cn(
        "relative flex items-center justify-center",
        interactive && "cursor-pointer group",
        className
      )}
    >
      {/* ... existing content with hover states ... */}
      
      {/* Orbital particles - speed up on hover */}
      <div className={cn(
        "animate-orbit-slow",
        (isHovered || ritualActive) && "animate-orbit-fast"
      )} />
      
      {/* Glass container - glow on hover */}
      <div className={cn(
        "panel-glass",
        interactive && "group-hover:cyber-glow-strong group-hover:scale-105"
      )}>
        {/* Icon */}
      </div>
    </button>
  );
}
```

### Файл: `src/pages/Today.tsx`

Подключить Hero-переход к сигилу:

```tsx
import { useHeroTransition } from '@/hooks/useHeroTransition';

function TodayContent() {
  const { startTransition } = useHeroTransition();
  const sigilRef = useRef<HTMLButtonElement>(null);
  
  const handleSigilClick = () => {
    navigator.vibrate?.(15);
    window.dispatchEvent(new CustomEvent('grimoire-ritual-start'));
    startTransition(sigilRef.current, '/new');
  };
  
  // В empty state:
  <BreathingSigil 
    ref={sigilRef}
    ritualActive={ritualActive}
    onClick={handleSigilClick}
    interactive={true}
  />
}
```

### Файл: `src/lib/i18n.tsx`

Обновить подсказку:

```tsx
// RU
'today.startDayHint': 'Нажми на книгу или + чтобы добавить первую запись',

// EN  
'today.startDayHint': 'Tap the book or + to add your first entry',
```

---

## Новые CSS-эффекты

```css
/* Hover glow усиление для интерактивного сигила */
.breathing-sigil-interactive:hover .panel-glass {
  box-shadow: 
    0 0 20px hsl(var(--sigil) / 0.3),
    0 0 40px hsl(var(--glow-primary) / 0.2);
  transform: scale(1.05);
}

/* Focus ring для accessibility */
.breathing-sigil-interactive:focus-visible {
  outline: 2px solid hsl(var(--sigil));
  outline-offset: 4px;
  border-radius: 0.5rem;
}
```

---

## Итоговый UX

1. Пользователь видит "дышащий" сигил
2. При наведении — orbital particles ускоряются, glow усиливается
3. При клике:
   - Haptic feedback (15ms)
   - Ritual event триггерит ripple
   - Hero-анимация раскрывает книгу на весь экран
   - Переход на `/new`
4. Идентичное поведение с кнопкой + (консистентность)

---

## Файлы для изменения

| Файл | Действие |
|------|----------|
| `src/components/icons/BreathingSigil.tsx` | Добавить onClick, interactive, hover states, forwardRef |
| `src/pages/Today.tsx` | Подключить useHeroTransition, передать обработчик |
| `src/lib/i18n.tsx` | Обновить текст подсказки |
| `src/index.css` | Hover/focus стили для интерактивного сигила |

