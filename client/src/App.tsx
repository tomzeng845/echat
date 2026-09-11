import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary from "@/components/ErrorBoundary";
import { ThemeProvider } from "@/contexts/ThemeContext";
import Home from "@/pages/Home";
import PrivacyPolicy from "@/pages/PrivacyPolicy";
import { lazy, Suspense } from "react";

const Admin = lazy(() => import("@/pages/Admin"));

export default function App() {
  const isAdmin = window.location.pathname.startsWith("/admin");
  const isPrivacy = window.location.pathname === "/privacy";
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          {isPrivacy ? (
            <PrivacyPolicy />
          ) : isAdmin ? (
            <Suspense
              fallback={
                <div className="grid min-h-full place-items-center bg-[#071421] text-sm text-teal-200">
                  正在加载 E聊控制台…
                </div>
              }
            >
              <Admin />
            </Suspense>
          ) : (
            <Home />
          )}
          <Toaster position="top-center" richColors />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
