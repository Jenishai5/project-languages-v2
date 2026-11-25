import { useId, type KeyboardEvent, type FocusEventHandler, type ReactNode } from "react";

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
  const id = useId();
  return (
    <div className="field">
      {label && (
        <label className="field__label" htmlFor={id}>
          {label}
        </label>
      )}
      <div className="field__control">
        <input
          id={id}
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
          <div className="field__suffix">
            {suffix}
          </div>
        )}
      </div>
    </div>
  );
}
