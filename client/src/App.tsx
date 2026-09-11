import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary from "@/components/ErrorBoundary";
import { ThemeProvider } from "@/contexts/ThemeContext";
import Home from "@/pages/Home";
import { lazy, Suspense } from "react";

const Admin = lazy(() => import("@/pages/Admin"));

export default function App() {
  const isAdmin = window.location.pathname.startsWith("/admin");
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          {isAdmin ? (
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
