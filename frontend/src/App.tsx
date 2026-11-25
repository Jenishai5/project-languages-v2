import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { useState } from "react";

import { AuthProvider, useAuth } from "./context/AuthContext";

import Landing         from "./pages/Landing";
import Dashboard       from "./pages/Dashboard";
import Game            from "./pages/Game";
import SentenceGame    from "./pages/SentenceGame";
import Lessons         from "./pages/Lessons";
import Lesson          from "./pages/Lesson";
import ProtectedLayout from "./components/organisms/ProtectedLayout";
import AppNavbar       from "./components/organisms/AppNavbar";

function RootLayout() {
  const [showAuth, setShowAuth] = useState(false);

  return (
    <div>
      <AppNavbar onSignIn={() => setShowAuth(true)} />
      <div>
        <Outlet context={{ showAuth, setShowAuth }} />
      </div>
      <footer>
        <div>
          <div>
            <img src="/turtle.png" alt="logo" />
            TurtleTalk
          </div>
          <span>© 2026 · Built with ❤️ and a lot of vocabulary</span>
        </div>
      </footer>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div>
      </div>
    );
  }

  return user ? <>{children}</> : <Navigate to="/" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<RootLayout />}>
            <Route path="/" element={<Landing />} />

            <Route element={<ProtectedRoute><ProtectedLayout /></ProtectedRoute>}>
              <Route path="/dashboard"         element={<Dashboard />} />
              <Route path="/game"             element={<Game />} />
              <Route path="/sentence-builder" element={<SentenceGame />} />
              <Route path="/lessons"          element={<Lessons />} />
              <Route path="/lessons/:lessonId" element={<Lesson />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
