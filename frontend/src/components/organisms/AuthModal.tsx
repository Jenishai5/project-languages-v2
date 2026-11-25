import { useState } from "react";
import AuthForm from "../AuthForm";
import TurtlePeek, { type TurtleState } from "../TurtlePeek";
import { ModalBackdrop } from "../ui";

interface AuthModalProps {
  onClose: () => void;
}

export default function AuthModal({ onClose }: AuthModalProps) {
  const [turtleState, setTurtleState] = useState<TurtleState>("idle");

  return (
    <ModalBackdrop onClose={onClose}>
      <div className="modal stack stack--loose" onClick={e => e.stopPropagation()}>
        <button className="btn btn--ghost btn--sm modal__close" onClick={onClose} aria-label="Close">Close</button>

        <div className="stack text-center">
          <TurtlePeek state={turtleState} />
          <div className="stack stack--tight">
            <h2 className="h2">{turtleState === "happy" ? "Welcome!" : "Welcome back"}</h2>
            <p className="muted">Sign in or create your free account</p>
          </div>
        </div>

        <AuthForm
          onPasswordFocus={() => setTurtleState("covering")}
          onPasswordBlur={() => setTurtleState(s => s === "happy" ? "happy" : "idle")}
          onPasswordTyping={() => setTurtleState(s => s === "happy" ? "happy" : "covering")}
          onSuccess={() => setTurtleState("happy")}
          onError={() => setTurtleState("wondered")}
          onTyping={() => setTurtleState(s => s === "wondered" ? "idle" : s)}
        />
      </div>
    </ModalBackdrop>
  );
}
