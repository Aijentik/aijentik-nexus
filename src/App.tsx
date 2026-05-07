import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth";
import { ProtectedLayout } from "@/components/Layout";
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import VoiceLive from "./pages/VoiceLive";
import FloorPlan from "./pages/FloorPlan";
import NewFloorPlan from "./pages/NewFloorPlan";
import LiveBrain from "./pages/LiveBrain";
import FlowStudio from "./pages/FlowStudio";
import Diary from "./pages/Diary";
import Calls from "./pages/Calls";
import Agents from "./pages/Agents";
import Knowledge from "./pages/Knowledge";
import Messages from "./pages/Messages";
import Insights from "./pages/Insights";
import Analytics from "./pages/Analytics";
import Integrations from "./pages/Integrations";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/app" element={<ProtectedLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="voice" element={<VoiceLive />} />
              <Route path="brain" element={<LiveBrain />} />
              <Route path="diary" element={<Diary />} />
              <Route path="floor" element={<FloorPlan />} />
              <Route path="floor/new" element={<NewFloorPlan />} />
              <Route path="calls" element={<Calls />} />
              <Route path="agents" element={<Agents />} />
              <Route path="knowledge" element={<Knowledge />} />
              <Route path="messages" element={<Messages />} />
              <Route path="insights" element={<Insights />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="integrations" element={<Integrations />} />
              <Route path="settings" element={<Settings />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
