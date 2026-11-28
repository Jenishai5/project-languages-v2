import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
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
    } catch (err: unknown) {
      setPwError(err instanceof Error && err.message ? err.message : "Something went wrong.");
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
      <nav className={`site-nav${isLanding ? " site-nav--hero" : ""}`} aria-label="Main">
        <div className="container site-nav__inner">
          <div className="site-nav__left">
            <Logo />
          </div>

          <div className="site-nav__right" ref={dropRef}>
            {user ? (
              <>
                {!isLanding && location.pathname !== "/dashboard" && (
                  <button className="btn btn--ghost btn--sm" onClick={() => navigate("/dashboard")}>Dashboard</button>
                )}
                {isLanding && (
                  <button className="btn btn--light btn--sm" onClick={() => navigate("/dashboard")}>Dashboard</button>
                )}
                <button
                  className="btn btn--ghost btn--sm"
                  onClick={() => setDropOpen(o => !o)}
                  aria-expanded={dropOpen}
                  aria-haspopup="menu"
                >
                  <span className="site-nav__name">{displayName}</span>
                  <Avatar initial={initial} />
                </button>

                {dropOpen && (
                  <div className="menu" role="menu">
                    <div className="menu__head">
                      <p className="h3">{displayName || "User"}</p>
                      <p className="small muted">{displayEmail}</p>
                    </div>
                    <button className="menu__item" role="menuitem" onClick={() => { setDropOpen(false); navigate("/mnemonics"); }}>
                      My picture cards
                    </button>
                    <button className="menu__item" role="menuitem" onClick={openPasswordModal}>
                      Change password
                    </button>
                    <button className="menu__item" role="menuitem" onClick={handleSignOut}>
                      Sign out
                    </button>
                  </div>
                )}
              </>
            ) : (
              <Button variant="secondary" size="sm" onClick={onSignIn}>Sign in</Button>
            )}
          </div>
        </div>
      </nav>

      {modalOpen && (
        <ModalBackdrop onClose={() => setModalOpen(false)}>
          <div className="modal stack">
            <button className="btn btn--ghost btn--sm modal__close" onClick={() => setModalOpen(false)} aria-label="Close">Close</button>
            <div className="stack stack--tight">
              <h2 className="h2">Change password</h2>
              <p className="muted">Choose a new secure password</p>
            </div>

            <Input label="New password"     type="password" placeholder="Min. 6 characters"  value={newPw}     onChange={setNewPw}     />
            <Input label="Confirm password" type="password" placeholder="Repeat new password" value={confirmPw} onChange={setConfirmPw} onKeyDown={e => e.key === "Enter" && handleChangePassword()} />

            {pwError && <Alert type="error"   message={pwError} />}
            {pwMsg   && <Alert type="success" message={pwMsg}   />}

            <div className="row">
              <button className="btn btn--primary" onClick={handleChangePassword} disabled={pwLoading}>
                {pwLoading ? "Saving…" : "Save password"}
              </button>
              <button className="btn btn--secondary" onClick={() => setModalOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </ModalBackdrop>
      )}
    </>
  );
}
