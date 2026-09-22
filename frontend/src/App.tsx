import { Route, Routes } from "react-router-dom";
import { AppLayout } from "./layout/AppLayout";
import { Dashboard } from "./pages/Dashboard";
import { NotFoundPage } from "./pages/NotFoundPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="/trends" element={<PlaceholderPage title="Tendências" phase="Fase 6" />} />
        <Route
          path="/opportunities"
          element={<PlaceholderPage title="Oportunidades" phase="Fase 8" />}
        />
        <Route path="/content" element={<PlaceholderPage title="Conteúdos" phase="Fase 12" />} />
        <Route path="/videos" element={<PlaceholderPage title="Vídeos" phase="Fase 17" />} />
        <Route path="/youtube" element={<PlaceholderPage title="YouTube" phase="Fase 4" />} />
        <Route
          path="/settings"
          element={<PlaceholderPage title="Configurações" phase="Fase 3" />}
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
