import { cn } from '@/lib/utils';

interface RabbitHoleIconProps {
  className?: string;
}

/**
 * A "rabbit hole" icon inspired by Alice in Wonderland.
 * Features a spiral tunnel with a small rabbit silhouette diving in.
 */
export function RabbitHoleIcon({ className }: RabbitHoleIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={cn("h-6 w-6", className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Outer spiral ring */}
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeOpacity="0.3"
      />
      
      {/* Middle spiral ring */}
      <circle
        cx="12"
        cy="12"
        r="7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeOpacity="0.5"
      />
      
      {/* Inner spiral ring */}
      <circle
        cx="12"
        cy="12"
        r="4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeOpacity="0.7"
      />
      
      {/* Dark center (the abyss) */}
      <circle
        cx="12"
        cy="12"
        r="2"
        fill="currentColor"
        fillOpacity="0.9"
      />
      
      {/* Rabbit silhouette diving in - simplified bunny shape */}
      <g transform="translate(11, 6) rotate(25)">
        {/* Body */}
        <ellipse
          cx="1"
          cy="3"
          rx="1.2"
          ry="2"
          fill="currentColor"
        />
        {/* Head */}
        <circle
          cx="1"
          cy="0.8"
          r="1"
          fill="currentColor"
        />
        {/* Left ear */}
        <ellipse
          cx="0.3"
          cy="-0.8"
          rx="0.3"
          ry="0.8"
          fill="currentColor"
        />
        {/* Right ear */}
        <ellipse
          cx="1.7"
          cy="-0.8"
          rx="0.3"
          ry="0.8"
          fill="currentColor"
        />
      </g>
    </svg>
  );
}
