export default function FeltIcon({ image, fallback }: { image?: string; fallback: string }) {
  return image ? <img className="felt-icon" src={image} alt="" draggable={false} /> : <>{fallback}</>;
}
