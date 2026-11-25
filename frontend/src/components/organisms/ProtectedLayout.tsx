import { Outlet } from "react-router-dom";

export default function ProtectedLayout() {
  return (
    <main className="page">
      <Outlet />
    </main>
  );
}
