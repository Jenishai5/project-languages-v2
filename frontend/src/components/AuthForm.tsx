import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { Alert, Input } from "./ui";

interface AuthFormProps {
  onPasswordFocus?:  () => void;
  onPasswordBlur?:   () => void;
  onPasswordTyping?: () => void;
  onSuccess?:        () => void;
  onError?:          () => void;
  onTyping?:         () => void;
}

export default function AuthForm({ onPasswordFocus, onPasswordBlur, onPasswordTyping, onSuccess, onError, onTyping }: AuthFormProps = {}) {
  const navigate = useNavigate();
  const { login, register } = useAuth();

  const [isLogin,       setIsLogin]       = useState(true);
  const [name,          setName]          = useState("");
  const [email,         setEmail]         = useState("");
  const [password,      setPassword]      = useState("");
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState("");
  const [showPassword,  setShowPassword]  = useState(false);

  const handleSubmit = async () => {
    setError("");
    if (!email || !password)      { setError("Please fill in all fields."); return; }
    if (!isLogin && !name.trim()) { setError("Please enter your name."); return; }
    if (password.length < 6)      { setError("Password must be at least 6 characters."); return; }

    setLoading(true);
    try {
      if (isLogin) await login(email, password);
      else         await register(name, email, password);
      onSuccess?.();
      setTimeout(() => navigate("/dashboard"), 900);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("Invalid credentials") || msg.includes("Invalid email or password")) {
        setError("Invalid email or password.");
      } else if (msg.includes("already")) {
        setError("This email is already registered.");
      } else {
        setError(msg || "Something went wrong. Try again.");
      }
      onError?.();
    } finally {
      setLoading(false);
    }
  };

  const onKey      = (e: React.KeyboardEvent) => { if (e.key === "Enter") handleSubmit(); };
  const switchMode = () => { setIsLogin(l => !l); setError(""); };

  const eyeBtn = (
    <button
      type="button"
      onClick={() => setShowPassword(p => !p)}
      aria-label={showPassword ? "Hide password" : "Show password"}
    >
      {showPassword ? "Hide" : "Show"}
    </button>
  );

  return (
    <div className="stack stack--loose">

      <div className="segmented">
        {(["Sign In", "Register"] as const).map((label, i) => {
          const active = isLogin ? i === 0 : i === 1;
          return (
            <button
              key={label}
              onClick={() => { setIsLogin(i === 0); setError(""); }}
              aria-pressed={active}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="stack">
        {!isLogin && (
          <Input label="Your name" placeholder="Jane Doe" value={name} onChange={v => { setName(v); onTyping?.(); }} onKeyDown={onKey} autoComplete="name" />
        )}
        <Input label="Email" type="email" placeholder="you@example.com" value={email} onChange={v => { setEmail(v); onTyping?.(); }} onKeyDown={onKey} autoComplete="email" />
        <Input
          label="Password"
          type={showPassword ? "text" : "password"}
          placeholder="••••••••"
          value={password}
          onChange={v => { setPassword(v); onPasswordTyping?.(); }}
          onKeyDown={onKey}
          onFocus={onPasswordFocus}
          onBlur={onPasswordBlur}
          autoComplete={isLogin ? "current-password" : "new-password"}
          suffix={eyeBtn}
        />

        {error && <Alert type="error" message={error} />}

        <button className="btn btn--primary btn--lg" onClick={handleSubmit} disabled={loading}>
          {loading ? "Please wait…" : isLogin ? "Sign In →" : "Create Account →"}
        </button>
      </div>

      <p className="small muted">
        {isLogin ? "No account yet? " : "Already have one? "}
        <button type="button" className="link-btn" onClick={switchMode}>
          {isLogin ? "Register here" : "Sign in"}
        </button>
      </p>

    </div>
  );
}
