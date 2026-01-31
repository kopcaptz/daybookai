import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  LogOut, 
  RefreshCw, 
  Filter,
  Inbox,
  Loader2,
  Search,
  ArrowUpDown,
  Download,
  ArrowLeft,
  X
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
import { Input } from '@/components/ui/input';
import { FeedbackCard, FeedbackItem } from '@/components/admin/FeedbackCard';
import { FeedbackImageModal } from '@/components/admin/FeedbackImageModal';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { createCsvContent, downloadCsv, formatDateForFilename } from '@/lib/csvExport';

type StatusFilter = 'all' | 'new' | 'read' | 'resolved' | 'archived';
type SortOrder = 'newest' | 'oldest';

export default function AdminFeedbackPage() {
  const navigate = useNavigate();
  const { isAuthenticated, tokenData, logout } = useAdminAccess();
  const [feedbackList, setFeedbackList] = useState<FeedbackItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');

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

  // Filter and sort feedback
  const filteredAndSortedFeedback = useMemo(() => {
    let result = [...feedbackList];
    
    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(item => 
        item.message.toLowerCase().includes(query) ||
        item.admin_notes?.toLowerCase().includes(query)
      );
    }
    
    // Sort
    result.sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
    });
    
    return result;
  }, [feedbackList, searchQuery, sortOrder]);

  const handleExportCsv = () => {
    const header = ['ID', 'Дата', 'Сообщение', 'Статус', 'Заметки админа', 'Изображение'];
    
    const rows = feedbackList.map(item => [
      item.id,
      new Date(item.created_at).toLocaleString('ru-RU'),
      item.message,
      item.status,
      item.admin_notes || '',
      item.image_url || '',
    ]);
    
    const csvContent = createCsvContent(header, rows);
    const filename = `feedback_${formatDateForFilename(new Date())}.csv`;
    downloadCsv(filename, csvContent);
    
    toast({
      title: "Экспорт завершён",
      description: `Скачан файл ${filename}`,
    });
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
          <div className="flex items-center gap-3">
            <Link to="/admin/dashboard">
              <Button variant="ghost" size="sm" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Назад</span>
              </Button>
            </Link>
            <div>
              <h1 className="text-lg font-serif text-foreground">Архив посланий</h1>
              <p className="text-xs text-muted-foreground">
                Всего: {total} {newCount > 0 && `• Новых: ${newCount}`}
              </p>
            </div>
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

      {/* Filters & Search */}
      <div className="max-w-4xl mx-auto px-4 py-4 space-y-3">
        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Поиск по сообщениям..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-9 h-9 bg-background/50"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        
        {/* Filter row */}
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="w-[140px] h-8 text-sm">
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
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSortOrder(sortOrder === 'newest' ? 'oldest' : 'newest')}
            className="h-8 gap-1.5 text-sm"
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            {sortOrder === 'newest' ? 'Новые' : 'Старые'}
          </Button>
          
          <div className="flex-1" />
          
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportCsv}
                  className="h-8 gap-1.5 text-sm"
                  disabled={feedbackList.length === 0}
                >
                  <Download className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">CSV</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Экспорт в CSV</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        
        {/* Results count */}
        {searchQuery && (
          <p className="text-xs text-muted-foreground">
            Найдено: {filteredAndSortedFeedback.length} из {feedbackList.length}
          </p>
        )}
      </div>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 pb-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredAndSortedFeedback.length === 0 ? (
          <div className="text-center py-12">
            <Inbox className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">
              {searchQuery ? 'Ничего не найдено' : 'Посланий пока нет'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredAndSortedFeedback.map(item => (
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
