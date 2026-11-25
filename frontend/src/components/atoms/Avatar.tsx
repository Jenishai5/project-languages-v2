interface AvatarProps {
  initial: string;
}

export default function Avatar({ initial }: AvatarProps) {
  return <span aria-hidden="true">{initial}</span>;
}
