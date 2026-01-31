import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Server, LogOut, ChevronRight, Sparkles, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import { cn } from '@/lib/utils';

interface DashboardSection {
  title: string;
  description: string;
  icon: React.ElementType;
  path: string;
  badge?: number;
  badgeVariant?: 'default' | 'destructive' | 'secondary';
}

export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const { isAuthenticated, tokenData, logout } = useAdminAccess();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [newFeedbackCount, setNewFeedbackCount] = useState(0);
  const [isLoadingFeedback, setIsLoadingFeedback] = useState(true);

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/admin', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  // Fetch new feedback count
  useEffect(() => {
    if (!tokenData?.token) return;

    const fetchNewCount = async () => {
      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-feedback-list?status=new&limit=100`,
          {
            headers: {
              'x-admin-token': tokenData.token,
              'Content-Type': 'application/json',
            },
          }
        );
        const data = await response.json();
        if (data.success) {
          setNewFeedbackCount(data.total || 0);
        }
      } catch (error) {
        console.error('Failed to fetch new feedback count:', error);
      } finally {
        setIsLoadingFeedback(false);
      }
    };

    fetchNewCount();
  }, [tokenData]);

  const handleLogoutClick = () => {
    setShowLogoutConfirm(true);
  };

  const handleLogoutConfirm = () => {
    logout();
    navigate('/settings', { replace: true });
  };

  const sections: DashboardSection[] = [
    {
      title: 'Послания',
      description: 'Фидбек от пользователей',
      icon: Mail,
      path: '/admin/feedback',
      badge: newFeedbackCount > 0 ? newFeedbackCount : undefined,
      badgeVariant: 'destructive',
    },
    {
      title: 'Система',
      description: 'Диагностика сервисов',
      icon: Server,
      path: '/admin/system',
    },
  ];

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background starry-bg">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/50 bg-card/80 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-serif text-foreground">Портал Мастера</h1>
              <p className="text-xs text-muted-foreground">Панель управления</p>
            </div>
          </div>
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
                <p>Выйти из портала</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </header>

      {/* New feedback banner */}
      {newFeedbackCount > 0 && (
        <div className="max-w-4xl mx-auto px-4 pt-4">
          <Link to="/admin/feedback">
            <div className={cn(
              "flex items-center gap-3 p-3 rounded-lg",
              "bg-violet-500/10 border border-violet-500/30",
              "hover:bg-violet-500/15 transition-colors cursor-pointer"
            )}>
              <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center">
                <Bell className="h-4 w-4 text-violet-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">
                  У вас {newFeedbackCount} {newFeedbackCount === 1 ? 'новое послание' : 
                    newFeedbackCount < 5 ? 'новых послания' : 'новых посланий'}
                </p>
                <p className="text-xs text-muted-foreground">Нажмите, чтобы просмотреть</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </Link>
        </div>
      )}

      {/* Section cards */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        <div className="grid gap-4 sm:grid-cols-2">
          {sections.map((section) => (
            <Link key={section.path} to={section.path}>
              <Card className={cn(
                "h-full transition-all duration-200",
                "hover:border-violet-500/40 hover:shadow-[0_0_20px_rgba(139,92,246,0.1)]",
                "bg-card/60 backdrop-blur-sm cursor-pointer"
              )}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center",
                      "bg-gradient-to-br from-violet-600/20 to-indigo-600/20"
                    )}>
                      <section.icon className="h-5 w-5 text-violet-400" />
                    </div>
                    {section.badge !== undefined && (
                      <Badge 
                        variant={section.badgeVariant || 'default'}
                        className="text-xs"
                      >
                        {section.badge}
                      </Badge>
                    )}
                  </div>
                  <CardTitle className="text-base mt-3">{section.title}</CardTitle>
                  <CardDescription className="text-sm">
                    {section.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center text-xs text-violet-400">
                    <span>Открыть</span>
                    <ChevronRight className="h-3 w-3 ml-1" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </main>

      {/* Logout confirmation dialog */}
      <AlertDialog open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Выйти из портала?</AlertDialogTitle>
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
