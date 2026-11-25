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
      <div
        onClick={e => e.stopPropagation()}
      >
        {/* turtle */}
        <div>
          <TurtlePeek state={turtleState} />
        </div>

        {/* close */}
        <button onClick={onClose}>✕</button>

        {/* header */}
        <div>
          <h2>
            {turtleState === "happy" ? "🎉 Welcome!" : "Welcome back"}
          </h2>
          <p>
            Sign in or create your free account
          </p>
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
