import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Initialize crash reporter before anything else
import { initCrashReporter } from "./lib/crashReporter";
initCrashReporter();

createRoot(document.getElementById("root")!).render(<App />);
