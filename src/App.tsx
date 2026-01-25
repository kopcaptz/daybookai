import { Suspense, lazy, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { BottomNav } from "@/components/BottomNav";
import { InstallPrompt } from "@/components/InstallPrompt";
import { PageTransition } from "@/components/PageTransition";
import { NotificationBanner } from "@/components/NotificationBanner";
import { GlobalAIPinDialog } from "@/components/GlobalAIPinDialog";
import { I18nProvider } from "@/lib/i18n";
import { initNotificationListeners } from "@/lib/notifications";

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

const queryClient = new QueryClient();

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
  
  // Initialize notification listeners on mount
  useEffect(() => {
    initNotificationListeners();
  }, []);
  
  // Hide bottom nav on entry editor and receipt pages
  const hideNav = location.pathname === '/new' || location.pathname.startsWith('/entry/') || location.pathname === '/receipts' || location.pathname.startsWith('/receipts/');

  return (
    <div className="min-h-screen bg-background starry-bg moon-vignette relative">
      <NotificationBanner />
      <div className="relative z-10">
        <PageTransition>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Today />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/chat" element={<ChatPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/new" element={<NewEntry />} />
              <Route path="/entry/:id" element={<NewEntry />} />
              <Route path="/day/:date" element={<DayView />} />
              <Route path="/receipts" element={<ReceiptsPage />} />
              <Route path="/receipts/scan" element={<ReceiptScanPage />} />
              <Route path="/receipts/review" element={<ReceiptReviewPage />} />
              <Route path="/receipts/analytics" element={<ReceiptAnalyticsPage />} />
              <Route path="/receipts/:id" element={<ReceiptDetailPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </PageTransition>
        {!hideNav && <BottomNav />}
        <InstallPrompt />
      </div>
    </div>
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
