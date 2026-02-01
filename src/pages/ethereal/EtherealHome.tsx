import { Navigate } from 'react-router-dom';
import { isEtherealSessionValid, getEtherealSession } from '@/lib/etherealTokenService';
import { EtherealHeader } from '@/components/ethereal/EtherealHeader';
import { useEtherealRealtime } from '@/hooks/useEtherealRealtime';
import { Circle } from 'lucide-react';

export default function EtherealHome() {
  if (!isEtherealSessionValid()) {
    return <Navigate to="/e/home" replace />;
  }

  const session = getEtherealSession();
  const { onlineMembers, isConnected } = useEtherealRealtime();

  return (
    <div className="flex flex-col min-h-screen">
      <EtherealHeader title="Private Space" />
      
      <div className="flex-1 p-4 space-y-6">
        {/* Connection status */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Circle
            className={`h-2 w-2 ${isConnected ? 'fill-green-500 text-green-500' : 'fill-muted text-muted'}`}
          />
          {isConnected ? 'Connected' : 'Connecting...'}
        </div>

        {/* Welcome card */}
        <div className="p-6 rounded-2xl bg-card border border-border">
          <h2 className="font-serif text-xl mb-2">Welcome, {session?.displayName}</h2>
          <p className="text-muted-foreground text-sm">
            This is your private shared space. Use the tabs below to chat, share chronicles, 
            manage tasks, or plan events together.
          </p>
        </div>

        {/* Online members */}
        {onlineMembers.length > 0 && (
          <div className="p-4 rounded-xl bg-muted/50">
            <h3 className="text-sm font-medium mb-3">Online Now</h3>
            <div className="flex flex-wrap gap-2">
              {onlineMembers.map((member) => (
                <div
                  key={member.memberId}
                  className="flex items-center gap-2 px-3 py-1.5 bg-background rounded-full text-sm"
                >
                  <Circle className="h-2 w-2 fill-green-500 text-green-500" />
                  {member.displayName}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-3">
          <QuickActionCard
            to="/e/chat"
            title="Chat"
            description="Send messages"
          />
          <QuickActionCard
            to="/e/chronicles"
            title="Chronicles"
            description="Shared journal"
          />
          <QuickActionCard
            to="/e/tasks"
            title="Tasks"
            description="To-do list"
          />
          <QuickActionCard
            to="/e/calendar"
            title="Calendar"
            description="Events"
          />
        </div>
      </div>
    </div>
  );
}

function QuickActionCard({ to, title, description }: { to: string; title: string; description: string }) {
  return (
    <a
      href={to}
      className="p-4 rounded-xl bg-card border border-border hover:border-primary/50 transition-colors"
    >
      <h4 className="font-medium">{title}</h4>
      <p className="text-xs text-muted-foreground">{description}</p>
    </a>
  );
}
