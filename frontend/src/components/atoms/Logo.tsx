import { Link } from "react-router-dom";

export default function Logo() {
  return (
    <Link to="/" className="brand" aria-label="TurtleTalk home">
      <img src="/turtle.png" alt="" width={40} height={40} />
      <span className="brand__name">TurtleTalk</span>
    </Link>
  );
}
