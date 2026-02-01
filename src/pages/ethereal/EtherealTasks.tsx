import { Navigate } from 'react-router-dom';
import { isEtherealSessionValid } from '@/lib/etherealTokenService';
import { EtherealHeader } from '@/components/ethereal/EtherealHeader';
import { CheckSquare } from 'lucide-react';

export default function EtherealTasks() {
  if (!isEtherealSessionValid()) {
    return <Navigate to="/e/home" replace />;
  }

  return (
    <div className="flex flex-col min-h-screen">
      <EtherealHeader title="Tasks" />
      
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <CheckSquare className="w-8 h-8 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-medium mb-2">Shared Tasks</h2>
        <p className="text-muted-foreground text-sm max-w-sm">
          Create and assign tasks for your group. Track progress together.
        </p>
        <p className="text-muted-foreground/60 text-xs mt-4">
          Coming soon
        </p>
      </div>
    </div>
  );
}
