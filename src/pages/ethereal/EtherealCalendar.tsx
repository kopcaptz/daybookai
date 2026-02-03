import { Navigate } from 'react-router-dom';
import { isEtherealSessionValid } from '@/lib/etherealTokenService';
import { EtherealHeader } from '@/components/ethereal/EtherealHeader';
import { Map } from 'lucide-react';
import { useI18n, getBaseLanguage } from '@/lib/i18n';

const texts = {
  navigatorMap: { ru: 'Штурманская карта', en: 'Navigator Map' },
  calendar: { ru: 'Календарь', en: 'Calendar' },
  planEvents: { ru: 'Планируйте события и важные даты. Никогда не пропустите встречу.', en: 'Plan events and important dates. Never miss a meeting.' },
  comingSoon: { ru: 'Скоро откроется', en: 'Coming soon' },
} as const;

export default function EtherealCalendar() {
  const { language } = useI18n();
  const lang = getBaseLanguage(language);
  const t = (key: keyof typeof texts) => texts[key][lang];

  if (!isEtherealSessionValid()) {
    return <Navigate to="/e/home" replace />;
  }

  return (
    <div className="flex flex-col min-h-screen yacht-gradient">
      <EtherealHeader title={t('navigatorMap')} subtitle={t('calendar')} />
      
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <Map className="w-8 h-8 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-medium mb-2">{t('navigatorMap')}</h2>
        <p className="text-muted-foreground text-sm max-w-sm">
          {t('planEvents')}
        </p>
        <p className="text-muted-foreground/60 text-xs mt-4">
          {t('comingSoon')}
        </p>
      </div>
    </div>
  );
}
