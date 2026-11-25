interface AlertProps {
  type: "error" | "success";
  message: string;
}

export default function Alert({ type, message }: AlertProps) {
  const isError = type === "error";
  return (
    <div>
      {isError ? "⚠️" : "✅"} {message}
    </div>
  );
}
