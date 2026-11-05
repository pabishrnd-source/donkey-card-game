/**
 * App root — sets up routing and providers.
 * The entire app is a single game view since the lobby/game/over screens
 * are all handled by the Game component's internal state.
 */
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Game from "@/pages/Game";
import NotFound from "@/pages/not-found";
import { useCallback, useState } from "react";
import { LaunchIntro } from "@/components/LaunchIntro";
import "./VillageTheme.css";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Game} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [introFinished, setIntroFinished] = useState(false);
  const finishIntro = useCallback(() => setIntroFinished(true), []);
  if (!introFinished) return <LaunchIntro onDone={finishIntro} />;
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
