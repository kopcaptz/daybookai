import { Suspense, lazy, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, useNavigate, Navigate } from "react-router-dom";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { BottomNav } from "@/components/BottomNav";
import { InstallPrompt } from "@/components/InstallPrompt";
import { PageTransition } from "@/components/PageTransition";
import { NotificationBanner } from "@/components/NotificationBanner";
import { GlobalAIPinDialog } from "@/components/GlobalAIPinDialog";
import { HeroTransitionProvider } from "@/components/HeroTransition";
import { FloatingChatButton } from "@/components/FloatingChatButton";
import { FeedbackModal } from "@/components/FeedbackModal";

import { I18nProvider } from "@/lib/i18n";
import { initNotificationListeners, setNavigationCallback } from "@/lib/notifications";
import { reconcileReminderNotifications } from "@/lib/reminderNotifications";
import { isOnboarded } from "@/lib/onboarding";

// Lazy load pages to reduce initial bundle size
const Today = lazy(() => import("./pages/Today"));
const CalendarPage = lazy(() => import("./pages/CalendarPage"));
const SearchPage = lazy(() => import("./pages/SearchPage"));
const ChatPage = lazy(() => import("./pages/ChatPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const NewEntry = lazy(() => import("./pages/NewEntry"));
const DayView = lazy(() => import("./pages/DayView"));
const NotFound = lazy(() => import("./pages/NotFound"));
const ReceiptsPage = lazy(() => import("./pages/ReceiptsPage"));
const ReceiptScanPage = lazy(() => import("./pages/ReceiptScanPage"));
const ReceiptReviewPage = lazy(() => import("./pages/ReceiptReviewPage"));
const ReceiptDetailPage = lazy(() => import("./pages/ReceiptDetailPage"));
const ReceiptAnalyticsPage = lazy(() => import("./pages/ReceiptAnalyticsPage"));
const ReminderDetailPage = lazy(() => import("./pages/ReminderDetailPage"));
const OnboardingPage = lazy(() => import("./pages/OnboardingPage"));
const DiscussionsListPage = lazy(() => import("./pages/DiscussionsListPage"));
const DiscussionChatPage = lazy(() => import("./pages/DiscussionChatPage"));
const AdminLoginPage = lazy(() => import("./pages/AdminLoginPage"));
const AdminFeedbackPage = lazy(() => import("./pages/AdminFeedbackPage"));

const queryClient = new QueryClient();

// Guard component for onboarding redirect
function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  
  // If not onboarded and not already on /onboarding, redirect
  if (!isOnboarded() && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }
  
  return <>{children}</>;
}

// Minimal loading fallback
function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
}

function AppContent() {
  const location = useLocation();
  const navigate = useNavigate();
  
  // Initialize notification listeners and navigation callback on mount
  useEffect(() => {
    // Set navigation callback for deep-links (uses react-router navigate)
    setNavigationCallback((path: string) => navigate(path));
    
    initNotificationListeners();
    
    // Reconcile reminder notifications on app start
    // Get language from localStorage or default to 'ru'
    const storedLang = localStorage.getItem('daybook-language') || 'ru';
    reconcileReminderNotifications(storedLang as 'ru' | 'en');
  }, [navigate]);
  
  // Hide bottom nav on entry editor, receipt pages, discussion chat, admin pages, and onboarding
  // Hide floating chat on chat page, entry editor, admin pages, and onboarding
  const hideNav = location.pathname === '/new' || 
    location.pathname.startsWith('/entry/') || 
    location.pathname === '/receipts' || 
    location.pathname.startsWith('/receipts/') || 
    location.pathname.startsWith('/discussions/') ||
    location.pathname.startsWith('/admin') ||
    location.pathname === '/onboarding';

  const hideFloatingChat = location.pathname === '/chat' || 
    location.pathname === '/new' || 
    location.pathname.startsWith('/entry/') ||
    location.pathname.startsWith('/admin') ||
    location.pathname === '/onboarding';
  
  // Hide feedback modal on admin pages and onboarding
  const hideFeedback = location.pathname.startsWith('/admin') || 
    location.pathname === '/onboarding';

  return (
    <HeroTransitionProvider>
      <div className="min-h-screen bg-background starry-bg moon-vignette relative">
        <NotificationBanner />
        <div className="relative z-10">
          <PageTransition>
            <Suspense fallback={<PageLoader />}>
              <Routes>
              {/* Onboarding route - no guard needed */}
              <Route path="/onboarding" element={<OnboardingPage />} />
              
              {/* All other routes wrapped in onboarding guard */}
              <Route path="/" element={<OnboardingGuard><Today /></OnboardingGuard>} />
              <Route path="/calendar" element={<OnboardingGuard><CalendarPage /></OnboardingGuard>} />
              <Route path="/search" element={<OnboardingGuard><SearchPage /></OnboardingGuard>} />
              <Route path="/chat" element={<OnboardingGuard><ChatPage /></OnboardingGuard>} />
              <Route path="/discussions" element={<OnboardingGuard><DiscussionsListPage /></OnboardingGuard>} />
              <Route path="/discussions/:id" element={<OnboardingGuard><DiscussionChatPage /></OnboardingGuard>} />
              <Route path="/settings" element={<OnboardingGuard><SettingsPage /></OnboardingGuard>} />
              <Route path="/new" element={<OnboardingGuard><NewEntry /></OnboardingGuard>} />
              <Route path="/entry/:id" element={<OnboardingGuard><NewEntry /></OnboardingGuard>} />
              <Route path="/day/:date" element={<OnboardingGuard><DayView /></OnboardingGuard>} />
              <Route path="/receipts" element={<OnboardingGuard><ReceiptsPage /></OnboardingGuard>} />
              <Route path="/receipts/scan" element={<OnboardingGuard><ReceiptScanPage /></OnboardingGuard>} />
              <Route path="/receipts/review" element={<OnboardingGuard><ReceiptReviewPage /></OnboardingGuard>} />
              <Route path="/receipts/analytics" element={<OnboardingGuard><ReceiptAnalyticsPage /></OnboardingGuard>} />
              <Route path="/receipts/:id" element={<OnboardingGuard><ReceiptDetailPage /></OnboardingGuard>} />
              <Route path="/reminder/:id" element={<OnboardingGuard><ReminderDetailPage /></OnboardingGuard>} />
              
              {/* Admin routes - no onboarding guard */}
              <Route path="/admin" element={<AdminLoginPage />} />
              <Route path="/admin/feedback" element={<AdminFeedbackPage />} />
              
              <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </PageTransition>
          {!hideNav && <BottomNav />}
          {!hideFloatingChat && <FloatingChatButton />}
          
          {!hideFeedback && <FeedbackModal />}
          <InstallPrompt />
        </div>
      </div>
    </HeroTransitionProvider>
  );
}

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner position="top-center" />
          <BrowserRouter>
            <AppContent />
            <GlobalAIPinDialog />
          </BrowserRouter>
        </TooltipProvider>
      </I18nProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
