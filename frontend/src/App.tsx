import { Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { RequireAuth } from "./auth/RequireAuth";
import { AppLayout } from "./layout/AppLayout";
import { ContentProjectDetailPage } from "./pages/ContentProjectDetailPage";
import { ContentProjectPreviewPage } from "./pages/ContentProjectPreviewPage";
import { ContentProjectsPage } from "./pages/ContentProjectsPage";
import { Dashboard } from "./pages/Dashboard";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { OpportunitiesPage } from "./pages/OpportunitiesPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { RegisterPage } from "./pages/RegisterPage";
import { TrendAnalysisPage } from "./pages/TrendAnalysisPage";
import { TrendsPage } from "./pages/TrendsPage";
import { YoutubePage } from "./pages/YoutubePage";

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        <Route element={<RequireAuth />}>
          <Route element={<AppLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="/trends" element={<TrendsPage />} />
            <Route path="/trends/:id" element={<TrendAnalysisPage />} />
            <Route path="/opportunities" element={<OpportunitiesPage />} />
            <Route path="/content" element={<ContentProjectsPage />} />
            <Route path="/content/:id" element={<ContentProjectDetailPage />} />
            <Route path="/content/:id/preview" element={<ContentProjectPreviewPage />} />
            <Route path="/videos" element={<PlaceholderPage title="Vídeos" phase="Fase 17" />} />
            <Route path="/youtube" element={<YoutubePage />} />
            <Route
              path="/settings"
              element={<PlaceholderPage title="Configurações" phase="uma fase futura" />}
            />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </AuthProvider>
  );
}
