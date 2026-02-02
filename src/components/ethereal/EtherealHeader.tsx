import { getEtherealSession, clearEtherealSession } from '@/lib/etherealTokenService';
import { Button } from '@/components/ui/button';
import { LogOut, Users, Anchor, Circle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { EtherealMembersSheet } from './EtherealMembersSheet';
import { useState } from 'react';

interface EtherealHeaderProps {
  title: string;
  subtitle?: string;
  isConnected?: boolean;
}

export function EtherealHeader({ title, subtitle, isConnected }: EtherealHeaderProps) {
  const [showMembers, setShowMembers] = useState(false);
  const navigate = useNavigate();
  const session = getEtherealSession();

  const handleLeave = () => {
    clearEtherealSession();
    navigate('/');
  };

  return (
    <>
      <header className="sticky top-0 bg-card/95 backdrop-blur-sm border-b border-border z-40">
        <div className="flex items-center justify-between h-14 px-4">
          {/* Left: Yacht name & status */}
          <div className="flex items-center gap-3">
            <Anchor className="h-5 w-5 text-primary" />
            <div className="flex flex-col">
              <span className="font-serif font-medium text-sm leading-tight">
                {title}
              </span>
              {subtitle && (
                <span className="text-[10px] text-muted-foreground leading-tight">
                  {subtitle}
                </span>
              )}
            </div>
          </div>

          {/* Center: Connection status */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Circle
              className={`h-1.5 w-1.5 ${
                isConnected 
                  ? 'fill-green-500 text-green-500' 
                  : 'fill-muted text-muted animate-pulse'
              }`}
            />
            <span>{isConnected ? 'На ходу' : 'В порту...'}</span>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowMembers(true)}
              className="h-9 w-9"
            >
              <Users className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLeave}
              className="h-9 w-9"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <EtherealMembersSheet
        open={showMembers}
        onOpenChange={setShowMembers}
        isOwner={session?.isOwner ?? false}
        currentMemberId={session?.memberId ?? ''}
      />
    </>
  );
}
