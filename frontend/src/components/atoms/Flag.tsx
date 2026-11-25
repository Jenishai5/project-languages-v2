import { FLAG_SRC } from "../../lib/flags";

interface FlagProps {
  lang: string;
  size?: number;
}

export default function Flag({ lang, size = 40 }: FlagProps) {
  const src = FLAG_SRC[lang];
  if (!src) return null;
  return <img className="flag" src={src} alt="" width={size} height={size} />;
}
