import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ru, enUS } from 'date-fns/locale';
import { 
  Loader2, 
  Clock, 
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useI18n } from '@/lib/i18n';
import { StoredBiography, requestBiographyGeneration } from '@/lib/biographyService';
import { toast } from 'sonner';
import { SealIcon, SigilIcon } from '@/components/icons/SigilIcon';

interface BiographyDisplayProps {
  date: string;
  biography: StoredBiography | undefined;
  onUpdate?: (bio: StoredBiography) => void;
  showGenerateButton?: boolean;
}

export function BiographyDisplay({ 
  date, 
  biography, 
  onUpdate,
  showGenerateButton = true,
}: BiographyDisplayProps) {
  const { t, language } = useI18n();
  const locale = language === 'ru' ? ru : enUS;
  const [isGenerating, setIsGenerating] = useState(false);
  
  const formattedDate = format(parseISO(date), 'd MMMM yyyy', { locale });
  
  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const bio = await requestBiographyGeneration(date, language, true);
      if (bio.status === 'complete') {
        toast.success(t('bio.success'));
      }
      onUpdate?.(bio);
    } catch {
      // Service already showed error toast
    } finally {
      setIsGenerating(false);
    }
  };
  
  // No biography yet
  if (!biography) {
    if (!showGenerateButton) return null;
    
    return (
      <Card className="overflow-hidden panel-glass border-cyber-glow/20">
        <CardHeader className="bg-gradient-to-r from-cyber-glow/10 to-cyber-glow-secondary/10">
          <CardTitle className="flex items-center gap-2 text-lg">
            <SealIcon className="h-5 w-5 text-cyber-sigil" />
            {t('bio.title')}
          </CardTitle>
          <CardDescription>{formattedDate}</CardDescription>
        </CardHeader>
        <CardContent className="pt-4 text-center">
          <p className="mb-4 text-sm text-muted-foreground">
            {language === 'ru' 
              ? 'Сигил создаст хронику вашего дня'
              : 'Sigil will create a chronicle of your day'}
          </p>
          <Button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="gap-2 btn-cyber"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('bio.generating')}
              </>
            ) : (
              <>
                <SigilIcon className="h-4 w-4" />
                {t('bio.generate')}
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }
  
  // Pending or failed
  if (biography.status === 'pending' || biography.status === 'failed') {
    return (
      <Card className="overflow-hidden panel-glass border-yellow-500/30">
        <CardHeader className="bg-yellow-500/10">
          <CardTitle className="flex items-center gap-2 text-lg">
            {biography.status === 'pending' ? (
              <Loader2 className="h-5 w-5 animate-spin text-cyber-sigil" />
            ) : (
              <AlertCircle className="h-5 w-5 text-yellow-500" />
            )}
            {t('bio.title')}
          </CardTitle>
          <CardDescription>
            {biography.status === 'pending' 
              ? t('bio.pending')
              : (language === 'ru' ? `${t('bio.channelError')}: ${biography.errorMessage}` : `${t('bio.channelError')}: ${biography.errorMessage}`)}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4 text-center">
          <Button
            onClick={handleGenerate}
            disabled={isGenerating}
            variant="outline"
            className="gap-2"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('bio.generating')}
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                {language === 'ru' ? 'Повторить' : 'Retry'}
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }
  
  // Complete biography
  const bio = biography.biography!;
  
  return (
    <Card className="overflow-hidden panel-glass border-cyber-glow/20">
      <CardHeader className="bg-gradient-to-r from-cyber-glow/10 to-cyber-glow-secondary/10">
        <CardTitle className="flex items-center gap-2 text-lg">
          <div className="bio-seal">
            <SealIcon className="h-4 w-4" />
          </div>
          {bio.title}
        </CardTitle>
        <CardDescription>{formattedDate}</CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4 pt-4">
        {/* Narrative */}
        <div className="rounded-lg bg-muted/30 p-4 border border-border/50">
          <p className="text-sm leading-relaxed whitespace-pre-wrap">
            {bio.narrative}
          </p>
        </div>
        
        {/* Highlights */}
        {bio.highlights.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <SigilIcon className="h-4 w-4 text-cyber-sigil" />
              {t('bio.highlights')}
            </h4>
            <ul className="space-y-1">
              {bio.highlights.map((highlight, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-sm text-muted-foreground"
                >
                  <span className="text-cyber-sigil">◇</span>
                  {highlight}
                </li>
              ))}
            </ul>
          </div>
        )}
        
        {/* Timeline */}
        {bio.timeline.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-cyber-rune" />
              {t('bio.moments')}
            </h4>
            <div className="space-y-2">
              {bio.timeline.map((moment, i) => (
                <div key={i} className="flex gap-3 text-sm">
                  <span className="shrink-0 font-medium text-cyber-sigil capitalize">
                    {moment.timeLabel}
                  </span>
                  <span className="text-muted-foreground">
                    {moment.summary}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Regenerate button */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleGenerate}
          disabled={isGenerating}
          className="w-full gap-2"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('bio.generating')}
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4" />
              {t('bio.regenerate')}
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
