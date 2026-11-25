import type { AgentLook, Mood } from "./agents";

function HairBack({ look }: { look: AgentLook }) {
  if (look.hair === "long") {
    return <path d="M-17 -88 Q-19 -60 -14 -52 L14 -52 Q19 -60 17 -88 Z" fill={look.hairColor} />;
  }
  if (look.hair === "bun") {
    return <circle cx="0" cy="-106" r="8" fill={look.hairColor} />;
  }
  return null;
}

function HairFront({ look }: { look: AgentLook }) {
  switch (look.hair) {
    case "curly":
      return (
        <g fill={look.hairColor}>
          {[-14, -7, 0, 7, 14].map(x => <circle key={x} cx={x} cy={-99 + Math.abs(x) * 0.25} r="7" />)}
          <circle cx="-16" cy="-90" r="5" />
          <circle cx="16" cy="-90" r="5" />
        </g>
      );
    case "short":
      return <path d="M-16 -88 Q-16 -104 0 -104 Q16 -104 16 -88 Q8 -96 -16 -88 Z" fill={look.hairColor} />;
    case "beard":
      return (
        <g fill={look.hairColor}>
          <path d="M-16 -90 Q-14 -104 0 -104 Q14 -104 16 -90 Q2 -98 -16 -90 Z" />
          <path d="M-13 -82 Q-12 -68 0 -66 Q12 -68 13 -82 Q8 -74 0 -75 Q-8 -74 -13 -82 Z" />
        </g>
      );
    default:
      return <path d="M-16 -86 Q-17 -103 0 -103 Q17 -103 16 -86 Q4 -96 -16 -86 Z" fill={look.hairColor} />;
  }
}

function PropShape({ look }: { look: AgentLook }) {
  switch (look.prop) {
    case "pen":
      return (
        <g transform="translate(24 -52) rotate(-35)">
          <rect x="-2.5" y="-16" width="5" height="22" rx="2" fill="#d23b2a" />
          <path d="M-2.5 6 L0 12 L2.5 6 Z" fill="#2e3320" />
        </g>
      );
    case "book":
      return (
        <g transform="translate(24 -50)">
          <rect x="-11" y="-9" width="22" height="16" rx="2" fill={look.color} stroke="#2e3320" strokeWidth="1.2" />
          <line x1="0" y1="-9" x2="0" y2="7" stroke="#fefdfb" strokeWidth="1.6" />
        </g>
      );
    case "bubble":
      return (
        <g transform="translate(30 -112)" className="teacher__bubble">
          <rect x="-16" y="-11" width="32" height="20" rx="9" fill="#fefdfb" stroke="#2e3320" strokeWidth="1.2" />
          <path d="M-6 9 L-10 16 L0 9 Z" fill="#fefdfb" stroke="#2e3320" strokeWidth="1.2" strokeLinejoin="round" />
          {[-7, 0, 7].map(x => <circle key={x} cx={x} cy="-1" r="2" fill="#2e3320" />)}
        </g>
      );
    case "mic":
      return (
        <g transform="translate(24 -52)">
          <rect x="-1.6" y="-2" width="3.2" height="16" rx="1.5" fill="#2e3320" />
          <circle cx="0" cy="-6" r="6" fill="#4a5133" />
          <circle cx="-2" cy="-8" r="1.6" fill="#fefdfb" opacity="0.6" />
        </g>
      );
    case "globe":
      return (
        <g transform="translate(25 -54)">
          <circle r="10" fill="#9fd3f0" stroke="#2e3320" strokeWidth="1.2" />
          <path d="M-6 -5 Q-1 -8 3 -4 Q1 0 -4 1 Z M2 3 Q6 2 7 6 Q3 8 1 6 Z" fill="#7fb069" />
          <line x1="0" y1="10" x2="0" y2="15" stroke="#2e3320" strokeWidth="2" />
        </g>
      );
  }
}

interface TeacherProps {
  look: AgentLook;
  mood: Mood;
}

export default function Teacher({ look, mood }: TeacherProps) {
  const tired = mood === "tired";
  return (
    <g className={`teacher teacher--${mood}`}>
      <ellipse cx="0" cy="2" rx="22" ry="5" fill="#2e3320" opacity="0.14" />
      <g className="teacher__bob">
        <g className="teacher__leg teacher__leg--l">
          <rect x="-9" y="-30" width="7" height="30" rx="3" fill="#3d4230" />
          <ellipse cx="-6" cy="0" rx="6" ry="3" fill="#2e3320" />
        </g>
        <g className="teacher__leg teacher__leg--r">
          <rect x="2" y="-30" width="7" height="30" rx="3" fill="#3d4230" />
          <ellipse cx="6" cy="0" rx="6" ry="3" fill="#2e3320" />
        </g>
        <HairBack look={look} />
        <path d="M-15 -26 Q-17 -60 -12 -66 L12 -66 Q17 -60 15 -26 Z" fill={look.color} />
        <path d="M-6 -66 L0 -58 L6 -66 Z" fill="#fefdfb" />
        <g className="teacher__arm">
          <rect x="12" y="-64" width="7" height="22" rx="3.5" fill={look.color} transform="rotate(-20 15 -62)" />
          <circle cx="22" cy="-45" r="4" fill={look.skin} />
        </g>
        <rect x="-19" y="-64" width="7" height="26" rx="3.5" fill={look.color} transform="rotate(8 -15 -62)" />
        <circle cx="-18" cy="-38" r="4" fill={look.skin} />
        <rect x="-4" y="-72" width="8" height="8" fill={look.skin} />
        <circle cx="0" cy="-86" r="16" fill={look.skin} />
        <HairFront look={look} />
        {tired ? (
          <g stroke="#2e3320" strokeWidth="1.8" strokeLinecap="round">
            <line x1="-8" y1="-86" x2="-3" y2="-86" />
            <line x1="3" y1="-86" x2="8" y2="-86" />
            <line x1="-3" y1="-78" x2="3" y2="-78" />
          </g>
        ) : (
          <g>
            <circle cx="-5.5" cy="-87" r="1.9" fill="#2e3320" />
            <circle cx="5.5" cy="-87" r="1.9" fill="#2e3320" />
            <path d="M-4.5 -80 Q0 -76 4.5 -80" stroke="#2e3320" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          </g>
        )}
        {tired && <path className="teacher__sweat" d="M17 -96 Q20 -90 17 -88 Q14 -90 17 -96 Z" fill="#7cc4ef" />}
        <PropShape look={look} />
      </g>
    </g>
  );
}
