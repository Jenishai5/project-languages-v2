export type TurtleState = "idle" | "covering" | "happy" | "wondered";

interface Props { state: TurtleState; }

const IMG: Record<TurtleState, string> = {
  idle:     "/turtle.png",
  covering: "/turtle2.png",
  happy:    "/turtle.png",
  wondered: "/wondered-turtle.png",
};

export default function TurtlePeek({ state }: Props) {
  return (
    <div className="turtle" data-state={state}>
      <img src={IMG[state]} alt="" />
      {state === "happy" && (
        <>
          <span className="turtle__spark" aria-hidden="true">✨</span>
          <span className="turtle__spark" aria-hidden="true">⭐</span>
        </>
      )}
      {state === "wondered" && <span className="turtle__spark" aria-hidden="true">❓</span>}
    </div>
  );
}
