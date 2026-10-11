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
        <path d="M11 29h42c-1 15-9 24-21 24S12 44 11 29Z" fill="#F6E5B4" stroke="#13244A" strokeWidth="4" strokeLinejoin="round" />
        <path d="M9 29h46" stroke="#13244A" strokeWidth="4" strokeLinecap="round" />
        <path d="m34 30 9-20 7 4-11 18" fill="#F19A38" stroke="#13244A" strokeWidth="3" strokeLinejoin="round" />
        <path d="M24 28c-9-2-11-10-5-14 1-7 12-7 14 0 7 2 6 12-1 14Z" fill="#62C66D" stroke="#13244A" strokeWidth="3" strokeLinejoin="round" />
        <path d="M27 18v11" stroke="#287B49" strokeWidth="3" strokeLinecap="round" />
        <circle cx="46" cy="25" r="5" fill="#E85A65" stroke="#13244A" strokeWidth="3" />
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
