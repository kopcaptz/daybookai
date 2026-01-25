import { Download, X, Smartphone } from 'lucide-react';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function InstallPrompt() {
  const { showPrompt, install, dismiss } = useInstallPrompt();

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 animate-slide-up">
      <div className="mx-auto max-w-md overflow-hidden rounded-xl border bg-card shadow-lg">
        <div className="flex items-start gap-3 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <Smartphone className="h-5 w-5 text-primary" />
          </div>
          
          <div className="flex-1 space-y-1">
            <h3 className="font-semibold">Установить на телефон</h3>
            <p className="text-sm text-muted-foreground">
              Добавьте Daybook на главный экран для быстрого доступа и работы офлайн
            </p>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={dismiss}
            aria-label="Закрыть"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex gap-2 border-t bg-muted/30 p-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={dismiss}
          >
            Позже
          </Button>
          <Button
            className="flex-1 gap-2"
            onClick={install}
          >
            <Download className="h-4 w-4" />
            Установить
          </Button>
        </div>
      </div>
    </div>
  );
}

// Compact version for settings page
export function InstallButton() {
  const { isInstallable, isInstalled, install, reset } = useInstallPrompt();

  if (isInstalled) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Smartphone className="h-4 w-4" />
        <span>Приложение установлено</span>
      </div>
    );
  }

  if (!isInstallable) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Smartphone className="h-4 w-4" />
          <span>Установка недоступна</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Откройте приложение в Chrome или Safari на мобильном устройстве
        </p>
      </div>
    );
  }

  return (
    <Button onClick={install} className="w-full gap-2">
      <Download className="h-4 w-4" />
      Установить на телефон
    </Button>
  );
}
