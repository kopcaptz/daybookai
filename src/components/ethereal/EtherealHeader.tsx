import { getEtherealSession, clearEtherealSession } from '@/lib/etherealTokenService';
import { Button } from '@/components/ui/button';
import { LogOut, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { EtherealMembersSheet } from './EtherealMembersSheet';
import { useState } from 'react';

interface EtherealHeaderProps {
  title: string;
}

export function EtherealHeader({ title }: EtherealHeaderProps) {
  const [showMembers, setShowMembers] = useState(false);
  const navigate = useNavigate();
  const session = getEtherealSession();

  const handleLeave = () => {
    clearEtherealSession();
    navigate('/');
  };

  return (
    <>
      <header className="sticky top-0 bg-background/95 backdrop-blur-sm border-b border-border z-40">
        <div className="flex items-center justify-between h-14 px-4">
          <h1 className="font-serif font-medium text-lg truncate">{title}</h1>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowMembers(true)}
            >
              <Users className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLeave}
            >
              <LogOut className="h-5 w-5" />
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
