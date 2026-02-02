import { Link } from 'react-router-dom';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CabinCardProps {
  to: string;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  disabled?: boolean;
  badge?: string;
}

export function CabinCard({ to, icon: Icon, title, subtitle, disabled, badge }: CabinCardProps) {
  const content = (
    <div
      className={cn(
        'cabin-card p-4 flex flex-col gap-2 h-full',
        disabled && 'opacity-60 cursor-not-allowed'
      )}
    >
      <div className="flex items-start justify-between">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        {badge && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
            {badge}
          </span>
        )}
      </div>
      <div className="mt-auto">
        <h3 className="font-medium text-sm">{title}</h3>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );

  if (disabled) {
    return <div className="flex-1 min-w-[140px]">{content}</div>;
  }

  return (
    <Link to={to} className="flex-1 min-w-[140px]">
      {content}
    </Link>
  );
}
