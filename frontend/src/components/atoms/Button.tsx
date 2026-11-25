export type Variant = "primary" | "secondary" | "dark" | "ghost";
export type Size = "sm" | "md" | "lg";

interface ButtonProps {
  children:  React.ReactNode;
  onClick?:  () => void;
  variant?:  Variant;
  size?:     Size;
  disabled?: boolean;
  type?:     "button" | "submit";
}

export default function Button({
  children,
  onClick,
  variant  = "primary",
  size     = "md",
  disabled = false,
  type     = "button",
}: ButtonProps) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} data-variant={variant} data-size={size}>
      {children}
    </button>
  );
}
