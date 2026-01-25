import { cn } from '@/lib/utils';

interface SigilIconProps {
  className?: string;
  size?: number;
  animated?: boolean;
}

// Abstract geometric sigil for AI representation
export function SigilIcon({ className, size = 24, animated = false }: SigilIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(animated && "animate-sigil-pulse", className)}
    >
      {/* Outer glow ring */}
      <circle
        cx="12"
        cy="12"
        r="11"
        stroke="currentColor"
        strokeWidth="0.5"
        opacity="0.2"
      />
      {/* Outer hexagon with luminous stroke */}
      <path
        d="M12 2L21.5 7.5V16.5L12 22L2.5 16.5V7.5L12 2Z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.7"
      />
      {/* Inner triangle pointing up */}
      <path
        d="M12 6L17 14H7L12 6Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Center dot with glow */}
      <circle
        cx="12"
        cy="12"
        r="2.5"
        fill="currentColor"
        opacity="0.9"
      />
      <circle
        cx="12"
        cy="12"
        r="1.5"
        fill="currentColor"
      />
      {/* Connection lines */}
      <line x1="12" y1="6" x2="12" y2="2" stroke="currentColor" strokeWidth="0.75" opacity="0.5" />
      <line x1="17" y1="14" x2="21.5" y2="16.5" stroke="currentColor" strokeWidth="0.75" opacity="0.5" />
      <line x1="7" y1="14" x2="2.5" y2="16.5" stroke="currentColor" strokeWidth="0.75" opacity="0.5" />
    </svg>
  );
}

// Seal icon for biography
export function SealIcon({ className, size = 24, animated = false }: SigilIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(animated && "animate-sigil-pulse", className)}
    >
      {/* Outer circle */}
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.5"
      />
      {/* Inner circle */}
      <circle
        cx="12"
        cy="12"
        r="7"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      {/* Cross pattern */}
      <line x1="12" y1="5" x2="12" y2="8" stroke="currentColor" strokeWidth="1.5" />
      <line x1="12" y1="16" x2="12" y2="19" stroke="currentColor" strokeWidth="1.5" />
      <line x1="5" y1="12" x2="8" y2="12" stroke="currentColor" strokeWidth="1.5" />
      <line x1="16" y1="12" x2="19" y2="12" stroke="currentColor" strokeWidth="1.5" />
      {/* Center diamond */}
      <path
        d="M12 9L15 12L12 15L9 12L12 9Z"
        fill="currentColor"
        opacity="0.8"
      />
      {/* Corner runes */}
      <circle cx="8" cy="8" r="1" fill="currentColor" opacity="0.4" />
      <circle cx="16" cy="8" r="1" fill="currentColor" opacity="0.4" />
      <circle cx="8" cy="16" r="1" fill="currentColor" opacity="0.4" />
      <circle cx="16" cy="16" r="1" fill="currentColor" opacity="0.4" />
    </svg>
  );
}

// Quill sigil for entry/writing
export function QuillSigilIcon({ className, size = 24 }: SigilIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Quill body */}
      <path
        d="M20 4C18.5 5.5 15 9 12 12C9 15 6 18 5 20"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* Feather top */}
      <path
        d="M20 4C20 4 22 2 21 2C20 2 18 4 18 4"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        opacity="0.6"
      />
      {/* Feather lines */}
      <path
        d="M17 6C15 5 14 6 14 6"
        stroke="currentColor"
        strokeWidth="0.75"
        strokeLinecap="round"
        opacity="0.4"
      />
      <path
        d="M15 8C13 7 12 8 12 8"
        stroke="currentColor"
        strokeWidth="0.75"
        strokeLinecap="round"
        opacity="0.4"
      />
      {/* Ink drop */}
      <circle
        cx="5"
        cy="20"
        r="1.5"
        fill="currentColor"
        opacity="0.8"
      />
    </svg>
  );
}

// Grimoire icon for app logo
export function GrimoireIcon({ className, size = 24 }: SigilIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Outer glow */}
      <rect
        x="3.5"
        y="1.5"
        width="17"
        height="21"
        rx="2"
        stroke="currentColor"
        strokeWidth="0.5"
        opacity="0.2"
      />
      {/* Book cover */}
      <path
        d="M4 4C4 3 5 2 6 2H18C19 2 20 3 20 4V20C20 21 19 22 18 22H6C5 22 4 21 4 20V4Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      {/* Spine */}
      <line x1="7" y1="2" x2="7" y2="22" stroke="currentColor" strokeWidth="1" opacity="0.6" />
      {/* Sigil on cover */}
      <path
        d="M12 7L16 12L12 17L8 12L12 7Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Center eye with glow */}
      <circle cx="12" cy="12" r="2" fill="currentColor" opacity="0.3" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      {/* Top/bottom accents */}
      <line x1="10" y1="5" x2="14" y2="5" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      <line x1="10" y1="19" x2="14" y2="19" stroke="currentColor" strokeWidth="1" opacity="0.5" />
    </svg>
  );
}

// Small seal glyph for subtle accents on empty states
export function SealGlyph({ className, size = 16 }: SigilIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1" opacity="0.4" />
      <path d="M8 4L11 8L8 12L5 8L8 4Z" stroke="currentColor" strokeWidth="1" opacity="0.6" />
      <circle cx="8" cy="8" r="1" fill="currentColor" opacity="0.5" />
    </svg>
  );
}
