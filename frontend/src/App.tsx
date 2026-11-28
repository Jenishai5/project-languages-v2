import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { useState } from "react";

import { AuthProvider } from "./context/AuthContext";
import { useAuth } from "./context/useAuth";

import Landing         from "./pages/Landing";
import Dashboard       from "./pages/Dashboard";
import Game            from "./pages/Game";
import SentenceGame    from "./pages/SentenceGame";
import Lessons         from "./pages/Lessons";
import Lesson          from "./pages/Lesson";
import Mnemonics       from "./pages/Mnemonics";
import StaffRoom       from "./pages/StaffRoom";
import ProtectedLayout from "./components/organisms/ProtectedLayout";
import AppNavbar       from "./components/organisms/AppNavbar";

function RootLayout() {
  const [showAuth, setShowAuth] = useState(false);

  return (
    <div className="app">
      <AppNavbar onSignIn={() => setShowAuth(true)} />
      <div className="app__main">
        <Outlet context={{ showAuth, setShowAuth }} />
      </div>
      <footer className="site-footer">
        <div className="container site-footer__inner">
          <span>TurtleTalk</span>
          <span>Sentences and recordings from Tatoeba, CC BY 2.0 FR</span>
        </div>
      </footer>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="spinner" role="status" aria-label="Loading" />;
  }

  return user ? <>{children}</> : <Navigate to="/" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/staff-room" element={<ProtectedRoute><StaffRoom /></ProtectedRoute>} />
          <Route element={<RootLayout />}>
            <Route path="/" element={<Landing />} />

            <Route element={<ProtectedRoute><ProtectedLayout /></ProtectedRoute>}>
              <Route path="/dashboard"         element={<Dashboard />} />
              <Route path="/game"             element={<Game />} />
              <Route path="/sentence-builder" element={<SentenceGame />} />
              <Route path="/lessons"          element={<Lessons />} />
              <Route path="/lessons/:lessonId" element={<Lesson />} />
              <Route path="/mnemonics"        element={<Mnemonics />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
