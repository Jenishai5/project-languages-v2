import type { KeyboardEvent, FocusEventHandler, ReactNode } from "react";

interface InputProps {
  label?:        string;
  type?:         "text" | "email" | "password";
  placeholder?:  string;
  value:         string;
  onChange:      (v: string) => void;
  onKeyDown?:    (e: KeyboardEvent<HTMLInputElement>) => void;
  onFocus?:      FocusEventHandler<HTMLInputElement>;
  onBlur?:       FocusEventHandler<HTMLInputElement>;
  autoComplete?: string;
  suffix?:       ReactNode;
}

export default function Input({
  label, type = "text", placeholder, value, onChange,
  onKeyDown, onFocus, onBlur, autoComplete, suffix,
}: InputProps) {
  return (
    <div>
      {label && (
        <label>
          {label}
        </label>
      )}
      <div>
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={onFocus}
          onBlur={onBlur}
          autoComplete={autoComplete}
        />
        {suffix && (
          <div>
            {suffix}
          </div>
        )}
      </div>
    </div>
  );
}
