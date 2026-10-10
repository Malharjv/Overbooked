import type { ItemName } from "./types";

export default function ItemIcon({
  item,
  size = 38,
  className = "",
}: {
  item: ItemName | "trash";
  size?: number;
  className?: string;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 64 64",
    className: `item-icon ${className}`,
    "aria-label": item,
  };

  if (item === "water") {
    return (
      <svg {...common}>
        <path d="M32 5C25 17 15 28 15 40a17 17 0 0 0 34 0C49 28 39 17 32 5Z" fill="#42B9F4" stroke="#13244A" strokeWidth="4" />
        <path d="M23 40c1 6 5 9 11 10" fill="none" stroke="#B9EDFF" strokeWidth="4" strokeLinecap="round" />
      </svg>
    );
  }
  if (item === "soda") {
    return (
      <svg {...common}>
        <path d="M20 18h25l-3 39H23L20 18Z" fill="#EF536B" stroke="#13244A" strokeWidth="4" strokeLinejoin="round" />
        <path d="M18 14h29M34 14l8-9" fill="none" stroke="#13244A" strokeWidth="4" strokeLinecap="round" />
        <path d="M27 27c8-5 7 10 14 4" fill="none" stroke="#FFF2D7" strokeWidth="4" strokeLinecap="round" />
      </svg>
    );
  }
  if (item === "chips") {
    return (
      <svg {...common}>
        <path d="m17 8 30 2-3 47-27-2V8Z" fill="#FFD04A" stroke="#13244A" strokeWidth="4" strokeLinejoin="round" />
        <path d="M18 17h28M18 47h27" stroke="#E45467" strokeWidth="5" />
        <ellipse cx="31" cy="32" rx="9" ry="7" fill="#ECA43A" stroke="#13244A" strokeWidth="3" />
        <path d="m27 33 8-3" stroke="#FFEAA0" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (item === "meat") {
    return (
      <svg {...common}>
        <path d="M12 38c0-12 12-24 25-23 8 0 17 7 16 16-1 13-16 23-29 20-8-2-12-7-12-13Z" fill="#E76A62" stroke="#13244A" strokeWidth="4" />
        <path d="M18 39c2 5 8 8 14 7" fill="none" stroke="#FFB0A4" strokeWidth="3" strokeLinecap="round" />
        <path d="m29 27 11 8M24 33l10 8" fill="none" stroke="#9F3F45" strokeWidth="3" strokeLinecap="round" />
        <circle cx="43" cy="27" r="4" fill="#FFE6C7" stroke="#13244A" strokeWidth="2.5" />
      </svg>
    );
  }
  if (item === "fish") {
    return (
      <svg {...common}>
        <path d="M11 32 4 20c9 0 14 3 18 7 8-9 22-10 35 5-13 15-27 14-35 5-4 4-9 7-18 7l7-12Z" fill="#5EC4D2" stroke="#13244A" strokeWidth="4" strokeLinejoin="round" />
        <circle cx="45" cy="29" r="2.5" fill="#13244A" />
        <path d="M25 27v10" stroke="#E8FCFF" strokeWidth="3" strokeLinecap="round" />
      </svg>
    );
  }
  if (item === "veg") {
    return (
      <svg {...common}>
        <path d="M31 27C17 11 7 20 12 33c4 10 13 13 20 12 7 1 16-2 20-12 5-13-5-22-19-6Z" fill="#65C96F" stroke="#13244A" strokeWidth="4" strokeLinejoin="round" />
        <path d="M32 28C30 16 34 9 44 6M33 18c6 0 10 2 13 6" fill="none" stroke="#287B49" strokeWidth="4" strokeLinecap="round" />
        <path d="M25 36h14" stroke="#B9F1A6" strokeWidth="3" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M18 18h28l-3 38H21l-3-38Z" fill="#72809A" stroke="#13244A" strokeWidth="4" strokeLinejoin="round" />
      <path d="M14 18h36M25 18v-7h14v7M27 27v20M37 27v20" fill="none" stroke="#13244A" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}
