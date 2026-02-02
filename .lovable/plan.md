
# Исправление чата Ethereal — ввод неактивен

## Проблема

Чат показывает "В порту..." (означает `isConnected = false`), хотя в консоли видно `[RT] connected + reconcile`. Это приводит к тому что:
- Поле ввода заблокировано (`disabled={!isConnected}`)
- Кнопка "+" заблокирована (`disabled={!isConnected}`)
- Кнопка отправки заблокирована

## Причина

**Нарушение правил React хуков** в `EtherealChat.tsx`:

```typescript
// ❌ НЕПРАВИЛЬНО: условный return ПЕРЕД вызовом хуков
if (!isEtherealSessionValid()) {
  return <Navigate to="/e/home" replace />;  // строка 38
}

const { messages, isConnected } = useEtherealRealtime();  // строка 43
```

React требует чтобы хуки вызывались **всегда в одном и том же порядке**. Условный `return` перед хуками нарушает это правило и приводит к:
- Потере состояния при Strict Mode перемонтировании
- Race condition между проверкой сессии и подпиской на канал
- Непредсказуемому значению `isConnected`

## Решение

### 1. Реструктурировать EtherealChat.tsx

Переместить все хуки **ДО** условного return:

```typescript
export default function EtherealChat() {
  const navigate = useNavigate();
  
  // 1. Все хуки вызываются ПЕРВЫМИ
  const { messages, typingMembers, sendTyping, sendMessage, isConnected } = useEtherealRealtime();
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [pendingImage, setPendingImage] = useState<...>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // 2. useEffect для обработки событий
  useEffect(() => { ... }, [navigate]);
  
  // 3. useEffect для скролла  
  useEffect(() => { ... }, [messages]);
  
  // 4. Функции-обработчики
  const handleInputChange = ...
  const handleImageSelect = ...
  
  // 5. УСЛОВНЫЙ RETURN ПОСЛЕ ВСЕХ ХУКОВ
  if (!isEtherealSessionValid()) {
    return <Navigate to="/e/home" replace />;
  }
  
  // 6. Получаем session только если валидна
  const session = getEtherealSession();
  
  return ( ... );
}
```

### 2. Исправить forwardRef в EtherealMediaButton

Добавить `React.forwardRef` для совместимости с Sheet:

```typescript
import { forwardRef } from 'react';

interface EtherealMediaButtonProps {
  onImageSelect: (blob: Blob) => void;
  disabled?: boolean;
}

export const EtherealMediaButton = forwardRef<HTMLButtonElement, EtherealMediaButtonProps>(
  ({ onImageSelect, disabled }, ref) => {
    // ... существующий код
  }
);

EtherealMediaButton.displayName = 'EtherealMediaButton';
```

## Изменяемые файлы

| Файл | Изменение |
|------|-----------|
| `src/pages/ethereal/EtherealChat.tsx` | Переместить все хуки до условного return |
| `src/components/ethereal/EtherealMediaButton.tsx` | Обернуть в forwardRef |

## Что изменится для пользователя

1. Чат будет корректно показывать "Шепнуть в бар..." когда соединение установлено
2. Поле ввода и кнопка "+" станут активными
3. Исчезнут предупреждения в консоли о forwardRef

## Техническая диаграмма

```text
До:                           После:
┌─────────────────────┐       ┌─────────────────────┐
│ if (!session)       │       │ useEtherealRealtime │
│   return <Navigate> │       │ useState(...)       │
│ useEtherealRealtime │  →    │ useRef(...)         │
│ useState(...)       │       │ useEffect(...)      │
│ useRef(...)         │       │ if (!session)       │
│                     │       │   return <Navigate> │
└─────────────────────┘       └─────────────────────┘
   ❌ Нарушение хуков           ✅ Правильный порядок
```

## Результат

- Стабильное соединение с realtime каналом
- Активный ввод сразу после загрузки чата
- Работающие кнопки "+" и отправки
- Устранены предупреждения React о хуках
