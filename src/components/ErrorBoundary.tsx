import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { reportCrash } from '@/lib/crashReporter';
import { translations, type Language } from '@/lib/i18n';

// Read language from localStorage (class component can't use hooks)
function getStoredLanguage(): Language {
  try {
    const saved = localStorage.getItem('daybook-language');
    if (saved === 'ru' || saved === 'en' || saved === 'he' || saved === 'ar') return saved;
  } catch { /* SSR or access error */ }
  return 'ru';
}

function t(key: keyof typeof translations): string {
  const lang = getStoredLanguage();
  const entry = translations[key];
  if (!entry) return key;
  return (entry[lang] ?? entry['en'] ?? entry['ru'] ?? key) as string;
}

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    // Report to crash reporter
    reportCrash({
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack || undefined,
    });
  }

  private isChunkLoadError(): boolean {
    const msg = this.state.error?.message || '';
    return (
      msg.includes('dynamically imported module') ||
      msg.includes('Loading chunk') ||
      msg.includes('Failed to fetch')
    );
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Special UI for chunk loading errors (stale deployment)
      if (this.isChunkLoadError()) {
        return (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-4 p-6 text-center">
            <div className="rounded-full bg-primary/10 p-4">
              <Download className="h-8 w-8 text-primary" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">{t('error.newVersion')}</h3>
              <p className="text-sm text-muted-foreground">
                {t('error.newVersionDesc')}
              </p>
            </div>
            <Button onClick={this.handleReload} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              {t('error.reload')}
            </Button>
          </div>
        );
      }

      // Default error UI
      return (
        <div className="flex min-h-[200px] flex-col items-center justify-center gap-4 p-6 text-center">
          <div className="rounded-full bg-destructive/10 p-4">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">{t('error.title')}</h3>
            <p className="text-sm text-muted-foreground">
              {t('error.desc')}
            </p>
          </div>
          <Button onClick={this.handleReset} variant="outline" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            {t('error.retry')}
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
