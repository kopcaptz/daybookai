import { Navigate } from 'react-router-dom';
import { isEtherealSessionValid, getEtherealSession } from '@/lib/etherealTokenService';
import { EtherealHeader } from '@/components/ethereal/EtherealHeader';
import { EtherealBottomTabs } from '@/components/ethereal/EtherealBottomTabs';
import { TasksList } from '@/components/ethereal/TasksList';
import { useEtherealTasks } from '@/hooks/useEtherealTasks';
import { useState, useEffect } from 'react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export default function EtherealTasks() {
  const [members, setMembers] = useState<Array<{ id: string; displayName: string }>>([]);
  const session = getEtherealSession();

  const {
    groupedTasks,
    isLoading,
    error,
    createTask,
    updateTask,
    toggleTask,
    deleteTask,
  } = useEtherealTasks();

  // Load members for assignee selection
  useEffect(() => {
    const loadMembers = async () => {
      if (!session) return;

      try {
        const response = await fetch(`${SUPABASE_URL}/functions/v1/ethereal_members`, {
          headers: {
            'Content-Type': 'application/json',
            'X-Ethereal-Token': session.token,
          },
        });
        const data = await response.json();
        if (data.success && Array.isArray(data.members)) {
          setMembers(data.members.map((m: any) => ({
            id: m.id,
            displayName: m.displayName,
          })));
        }
      } catch (e) {
        console.error('[EtherealTasks] Failed to load members:', e);
      }
    };

    loadMembers();
  }, [session?.roomId]);

  if (!isEtherealSessionValid()) {
    return <Navigate to="/e/home" replace />;
  }

  return (
    <div className="flex flex-col min-h-screen yacht-gradient">
      <EtherealHeader title="Мостик" subtitle="Задачи" />
      
      <div className="flex-1 pt-4">
        <TasksList
          groupedTasks={groupedTasks}
          isLoading={isLoading}
          error={error}
          onToggle={toggleTask}
          onCreate={createTask}
          onUpdate={updateTask}
          onDelete={deleteTask}
          members={members}
          currentMemberId={session?.memberId}
        />
      </div>

      <EtherealBottomTabs />
    </div>
  );
}
