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

const VARIANT_CLASS: Record<Variant, string> = {
  primary:   "btn--primary",
  secondary: "btn--secondary",
  dark:      "btn--secondary",
  ghost:     "btn--ghost",
};

const SIZE_CLASS: Record<Size, string> = {
  sm: "btn--sm",
  md: "",
  lg: "btn--lg",
};

export default function Button({
  children,
  onClick,
  variant  = "primary",
  size     = "md",
  disabled = false,
  type     = "button",
}: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      data-variant={variant}
      data-size={size}
      className={`btn ${VARIANT_CLASS[variant]} ${SIZE_CLASS[size]}`.trim()}
    >
      {children}
    </button>
  );
}
