import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  LogOut, 
  RefreshCw, 
  Filter,
  Inbox,
  Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useAdminAccess } from '@/hooks/useAdminAccess';
import { FeedbackCard, FeedbackItem } from '@/components/admin/FeedbackCard';
import { FeedbackImageModal } from '@/components/admin/FeedbackImageModal';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type StatusFilter = 'all' | 'new' | 'read' | 'resolved' | 'archived';

export default function AdminFeedbackPage() {
  const navigate = useNavigate();
  const { isAuthenticated, tokenData, logout } = useAdminAccess();
  const [feedbackList, setFeedbackList] = useState<FeedbackItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/admin', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const fetchFeedback = useCallback(async () => {
    if (!tokenData?.token) return;

    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') {
        params.set('status', statusFilter);
      }
      params.set('limit', '100');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-feedback-list?${params}`,
        {
          headers: {
            'x-admin-token': tokenData.token,
            'Content-Type': 'application/json',
          },
        }
      );

      const data = await response.json();

      if (!data.success) {
        if (data.error === 'invalid_token' || data.error === 'unauthorized') {
          logout();
          navigate('/admin', { replace: true });
          return;
        }
        throw new Error(data.error);
      }

      setFeedbackList(data.data || []);
      setTotal(data.total || 0);
    } catch (error) {
      console.error('Fetch feedback error:', error);
      toast({
        title: "Ошибка загрузки",
        description: "Не удалось загрузить список посланий",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [tokenData, statusFilter, logout, navigate]);

  useEffect(() => {
    fetchFeedback();
  }, [fetchFeedback]);

  const handleUpdateStatus = async (id: string, status: FeedbackItem['status']) => {
    if (!tokenData?.token) return;

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-feedback-update`,
        {
          method: 'PATCH',
          headers: {
            'x-admin-token': tokenData.token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ id, status }),
        }
      );

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error);
      }

      // Update local state
      setFeedbackList(prev => 
        prev.map(item => item.id === id ? { ...item, status } : item)
      );

      toast({
        title: "Статус обновлён",
      });
    } catch (error) {
      console.error('Update status error:', error);
      toast({
        title: "Ошибка",
        description: "Не удалось обновить статус",
        variant: "destructive",
      });
    }
  };

  const handleUpdateNotes = async (id: string, admin_notes: string) => {
    if (!tokenData?.token) return;

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-feedback-update`,
        {
          method: 'PATCH',
          headers: {
            'x-admin-token': tokenData.token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ id, admin_notes }),
        }
      );

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error);
      }

      // Update local state
      setFeedbackList(prev => 
        prev.map(item => item.id === id ? { ...item, admin_notes } : item)
      );

      toast({
        title: "Заметка сохранена",
      });
    } catch (error) {
      console.error('Update notes error:', error);
      toast({
        title: "Ошибка",
        description: "Не удалось сохранить заметку",
        variant: "destructive",
      });
    }
  };

  const handleLogoutClick = () => {
    setShowLogoutConfirm(true);
  };

  const handleLogoutConfirm = () => {
    logout();
    navigate('/settings', { replace: true });
  };

  const newCount = feedbackList.filter(f => f.status === 'new').length;

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background starry-bg">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/50 bg-card/80 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-serif text-foreground">Архив посланий</h1>
            <p className="text-xs text-muted-foreground">
              Всего: {total} {newCount > 0 && `• Новых: ${newCount}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              size="sm" 
              variant="ghost" 
              onClick={fetchFeedback}
              disabled={isLoading}
            >
              <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            </Button>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    onClick={handleLogoutClick}
                    className="text-muted-foreground"
                  >
                    <LogOut className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Выйти из архива</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </header>

      {/* Filters */}
      <div className="max-w-4xl mx-auto px-4 py-4">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="w-[160px] h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все статусы</SelectItem>
              <SelectItem value="new">Новые</SelectItem>
              <SelectItem value="read">Прочитанные</SelectItem>
              <SelectItem value="resolved">Решённые</SelectItem>
              <SelectItem value="archived">В архиве</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 pb-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : feedbackList.length === 0 ? (
          <div className="text-center py-12">
            <Inbox className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">Посланий пока нет</p>
          </div>
        ) : (
          <div className="space-y-3">
            {feedbackList.map(item => (
              <FeedbackCard
                key={item.id}
                item={item}
                onUpdateStatus={handleUpdateStatus}
                onUpdateNotes={handleUpdateNotes}
                onImageClick={setSelectedImage}
              />
            ))}
          </div>
        )}
      </main>

      {/* Image modal */}
      <FeedbackImageModal 
        imageUrl={selectedImage} 
        onClose={() => setSelectedImage(null)} 
      />

      {/* Logout confirmation dialog */}
      <AlertDialog open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Выйти из архива?</AlertDialogTitle>
            <AlertDialogDescription>
              Вы вернётесь в настройки. Для повторного входа потребуется PIN-код.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleLogoutConfirm}>
              Выйти
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
