interface AlertProps {
  type: "error" | "success";
  message: string;
}

export default function Alert({ type, message }: AlertProps) {
  return (
    <div className="alert" data-type={type} role={type === "error" ? "alert" : "status"}>
      {message}
    </div>
  );
}
