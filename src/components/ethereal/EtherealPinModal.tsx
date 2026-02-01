import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { setEtherealSession } from '@/lib/etherealTokenService';
import { getOrCreateDeviceId } from '@/lib/etherealDeviceId';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

interface EtherealPinModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EtherealPinModal({ open, onOpenChange }: EtherealPinModalProps) {
  const [pin, setPin] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin || !displayName.trim()) return;

    setIsLoading(true);
    setError('');

    try {
      const deviceId = getOrCreateDeviceId();

      const response = await fetch(`${SUPABASE_URL}/functions/v1/ethereal_join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pin,
          deviceId,
          displayName: displayName.trim(),
        }),
      });

      const data = await response.json();

      if (!data.success) {
        if (data.error === 'room_full') {
          setError('Room is full. Maximum 5 members allowed.');
        } else if (data.error === 'pin_too_short') {
          setError('PIN must be at least 4 characters.');
        } else {
          setError('Failed to join. Please try again.');
        }
        return;
      }

      // Save session
      setEtherealSession({
        token: data.accessToken,
        roomId: data.roomId,
        memberId: data.memberId,
        channelKey: data.channelKey,
        expiresAt: data.expiresAt,
        isOwner: data.isOwner,
        displayName: displayName.trim(),
      });

      // Navigate to ethereal home
      onOpenChange(false);
      navigate('/e/home');
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="font-serif">Enter the Chamber</DialogTitle>
          <DialogDescription>
            Enter a shared PIN to join or create a private space.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="displayName">Your Name</Label>
            <Input
              id="displayName"
              placeholder="How others will see you"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={30}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pin">Shared PIN</Label>
            <Input
              id="pin"
              type="password"
              placeholder="At least 4 characters"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              minLength={4}
            />
            <p className="text-xs text-muted-foreground">
              Same PIN = same room. Share it only with trusted people.
            </p>
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <Button type="submit" className="w-full" disabled={isLoading || !pin || !displayName.trim()}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Joining...
              </>
            ) : (
              'Enter'
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
