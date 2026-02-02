
# Исправление кнопки "+" в Ethereal Chat

## Проблема

Кнопка "+" не открывает меню выбора фото/камеры на Android Chrome. В консоли видны предупреждения:
- `Function components cannot be given refs` в `EtherealMediaButton`
- `DropdownMenuContent` также имеет проблемы с ref

Radix DropdownMenu работает нестабильно с touch-событиями на Android.

## Решение

Заменить `DropdownMenu` на `Sheet` (bottom sheet), который надёжно работает на мобильных устройствах. Это соответствует стилю приложения и паттерну, используемому в других местах.

## Изменения

### EtherealMediaButton.tsx

| До | После |
|----|-------|
| DropdownMenu с Trigger | Sheet с Plus-кнопкой как Trigger |
| DropdownMenuContent сверху | SheetContent снизу экрана |
| DropdownMenuItem | Кнопки с иконками в sheet |

### Что изменится для пользователя

1. Нажатие "+" откроет **нижнюю панель** вместо выпадающего меню
2. Две большие кнопки: "Камера" и "Галерея"
3. Панель закроется автоматически после выбора

## Техническая реализация

```text
+-----------------------------------+
|                                   |
|    [Камера]      [Галерея]        |
|                                   |
+-----------------------------------+
```

```typescript
// Заменить DropdownMenu на Sheet
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';

// Компонент с Sheet вместо DropdownMenu
export function EtherealMediaButton({ onImageSelect, disabled }) {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon">
          <Plus />
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom">
        <div className="flex gap-4 justify-center">
          <Button onClick={() => { cameraRef.current?.click(); setIsOpen(false); }}>
            <Camera /> Камера
          </Button>
          <Button onClick={() => { galleryRef.current?.click(); setIsOpen(false); }}>
            <ImageIcon /> Галерея
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

## Изменяемые файлы

| Файл | Изменение |
|------|-----------|
| `src/components/ethereal/EtherealMediaButton.tsx` | Заменить DropdownMenu на Sheet |

## Результат

- Кнопка "+" будет открывать надёжную нижнюю панель
- Устранятся forwardRef предупреждения
- Улучшится UX на мобильных устройствах
