import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import Logo   from "../atoms/Logo";
import Avatar from "../atoms/Avatar";
import Button from "../atoms/Button";
import { Alert, Input, ModalBackdrop } from "../ui";

interface AppNavbarProps {
  onSignIn?: () => void;
}

export default function AppNavbar({ onSignIn }: AppNavbarProps) {
  const navigate  = useNavigate();
  const location  = useLocation();
  const isLanding = location.pathname === "/";

  const { user, logout, changePassword } = useAuth();

  const [dropOpen, setDropOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setDropOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const [modalOpen, setModalOpen] = useState(false);
  const [newPw,     setNewPw]     = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwMsg,     setPwMsg]     = useState("");
  const [pwError,   setPwError]   = useState("");
  const [pwLoading, setPwLoading] = useState(false);

  const openPasswordModal = () => {
    setDropOpen(false);
    setNewPw(""); setConfirmPw(""); setPwMsg(""); setPwError("");
    setModalOpen(true);
  };

  const handleChangePassword = async () => {
    setPwMsg(""); setPwError("");
    if (newPw.length < 6)    { setPwError("Password must be at least 6 characters."); return; }
    if (newPw !== confirmPw) { setPwError("Passwords don't match."); return; }
    setPwLoading(true);
    try {
      await changePassword(newPw);
      setPwMsg("Password updated!");
      setTimeout(() => { setModalOpen(false); setPwMsg(""); }, 1800);
    } catch (err: any) {
      setPwError(err?.message || "Something went wrong.");
    } finally {
      setPwLoading(false);
    }
  };

  const handleSignOut = () => { logout(); navigate("/"); };

  const displayName  = user?.name  || user?.email || "";
  const displayEmail = user?.email || "";
  const initial      = displayName ? displayName[0].toUpperCase() : "?";

  return (
    <>
      <nav>

        {!isLanding && (
          <div>
            <button
              onClick={() => location.pathname === "/dashboard" ? navigate("/") : navigate("/dashboard")}
              title={location.pathname === "/dashboard" ? "Back to home" : "Back to dashboard"}
            >←</button>
          </div>
        )}

        <div>
          <Logo />
        </div>

        <div ref={dropRef}>
          {user ? (
            <>
              <span>{displayName}</span>
              <button
                onClick={() => setDropOpen(o => !o)}
              >
                <Avatar initial={initial} />
              </button>

              {dropOpen && (
                <div>
                  <div>
                    <p>{displayName || "User"}</p>
                    <p>{displayEmail}</p>
                  </div>
                  <div>
                    <button
                      onClick={openPasswordModal}
                    >
                      🔑 Change password
                    </button>
                    <button
                      onClick={handleSignOut}
                    >
                      🚪 Sign out
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <Button variant="dark" size="sm" onClick={onSignIn}>Sign In →</Button>
          )}
        </div>
      </nav>

      {modalOpen && (
        <ModalBackdrop onClose={() => setModalOpen(false)}>
          <div>

            <div>
              <div>
                <h2>Change password</h2>
                <p>Choose a new secure password</p>
              </div>
              <button onClick={() => setModalOpen(false)}>✕</button>
            </div>

            <Input label="New password"     type="password" placeholder="Min. 6 characters"  value={newPw}     onChange={setNewPw}     />
            <Input label="Confirm password" type="password" placeholder="Repeat new password" value={confirmPw} onChange={setConfirmPw} onKeyDown={e => e.key === "Enter" && handleChangePassword()} />

            {pwError && <Alert type="error"   message={pwError} />}
            {pwMsg   && <Alert type="success" message={pwMsg}   />}

            <div>
              <button
                onClick={handleChangePassword}
                disabled={pwLoading}
              >
                {pwLoading ? "Saving…" : "Save password"}
              </button>
              <button
                onClick={() => setModalOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </ModalBackdrop>
      )}
    </>
  );
}
