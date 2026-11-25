interface AvatarProps {
  initial: string;
}

export default function Avatar({ initial }: AvatarProps) {
  return <span className="avatar" aria-hidden="true">{initial}</span>;
}
