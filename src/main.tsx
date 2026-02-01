import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Initialize crash reporter before anything else
import { initCrashReporter } from "./lib/crashReporter";
initCrashReporter();

// Initialize analysis queue processor
import { processAnalysisQueue } from "./lib/entryAnalysisService";

// Process queue on app startup (with delay to let app initialize)
setTimeout(() => {
  console.log('[App] Startup: checking analysis queue');
  processAnalysisQueue();
}, 3000);

// Process queue when coming back online
window.addEventListener('online', () => {
  console.log('[App] Back online, processing analysis queue');
  processAnalysisQueue();
});

// Periodic processing (every 5 minutes)
setInterval(() => {
  processAnalysisQueue();
}, 5 * 60 * 1000);

createRoot(document.getElementById("root")!).render(<App />);
