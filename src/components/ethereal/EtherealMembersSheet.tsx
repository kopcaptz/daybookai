import { useState, useEffect } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { X, Crown, Loader2 } from 'lucide-react';
import { getEtherealApiHeaders } from '@/lib/etherealTokenService';
import { formatDistanceToNow } from 'date-fns';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

interface Member {
  id: string;
  displayName: string;
  joinedAt: string;
  lastSeenAt: string;
  isOwner: boolean;
}

interface EtherealMembersSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isOwner: boolean;
  currentMemberId: string;
  onKickSuccess?: (targetMemberId: string) => void;
}

export function EtherealMembersSheet({
  open,
  onOpenChange,
  isOwner,
  currentMemberId,
  onKickSuccess,
}: EtherealMembersSheetProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [kickingId, setKickingId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      loadMembers();
    }
  }, [open]);

  const loadMembers = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/ethereal_members`, {
        headers: getEtherealApiHeaders(),
      });
      const data = await response.json();
      if (data.success) {
        setMembers(data.members);
      }
    } catch (error) {
      // Masked error
    } finally {
      setIsLoading(false);
    }
  };

  const handleKick = async (memberId: string) => {
    if (!isOwner || memberId === currentMemberId) return;

    setKickingId(memberId);
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/ethereal_members`, {
        method: 'DELETE',
        headers: getEtherealApiHeaders(),
        body: JSON.stringify({ memberId }),
      });

      const data = await response.json();
      if (data.success) {
        // Broadcast kick to force target logout
        onKickSuccess?.(memberId);
        // Update local list
        setMembers((prev) => prev.filter((m) => m.id !== memberId));
      }
    } catch (error) {
      // Masked error
    } finally {
      setKickingId(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Members</SheetTitle>
        </SheetHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-2 mt-4">
            {members.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate">{member.displayName}</p>
                    {member.isOwner && (
                      <Crown className="h-4 w-4 text-amber-500 flex-shrink-0" />
                    )}
                    {member.id === currentMemberId && (
                      <span className="text-xs text-muted-foreground">(you)</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Last seen {formatDistanceToNow(new Date(member.lastSeenAt))} ago
                  </p>
                </div>

                {isOwner && member.id !== currentMemberId && !member.isOwner && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleKick(member.id)}
                    disabled={kickingId === member.id}
                  >
                    {kickingId === member.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <X className="h-4 w-4" />
                    )}
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
