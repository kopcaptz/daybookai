import { MessageCircleQuestion } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';

interface FollowUpQuestionsProps {
  questions: string[];
  onSelect: (question: string) => void;
}

export function FollowUpQuestions({ questions, onSelect }: FollowUpQuestionsProps) {
  const { language } = useI18n();
  
  if (!questions || questions.length === 0) return null;
  
  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <MessageCircleQuestion className="h-3.5 w-3.5" />
        <span>{language === 'ru' ? 'Продолжить обсуждение:' : 'Continue discussion:'}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {questions.slice(0, 4).map((question, index) => (
          <Button
            key={index}
            variant="outline"
            size="sm"
            onClick={() => onSelect(question)}
            className="h-auto py-1.5 px-3 text-xs text-left whitespace-normal max-w-full"
          >
            {question}
          </Button>
        ))}
      </div>
    </div>
  );
}
