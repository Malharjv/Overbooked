import type { MapId } from "./types";

export interface FlightMap {
  id: MapId;
  name: string;
  shortName: string;
  difficulty: "CALM" | "BREEZY" | "SEVERE";
  description: string;
  forecast: string;
  icon: string;
  palette: {
    sky: string;
    fog: string;
    horizon: string;
    cabinAccent: string;
    carpet: string;
    light: string;
  };
  environment: {
    wind: number;
    turbulence: number;
    rain: number;
    lightning: boolean;
  };
}

export const FLIGHT_MAPS: Record<MapId, FlightMap> = {
  "smooth-skies": {
    id: "smooth-skies",
    name: "Smooth Skies",
    shortName: "SMOOTH SKIES",
    difficulty: "CALM",
    description: "A clear daytime route made for coordinated cabin service.",
    forecast: "Clear skies · Light breeze",
    icon: "☀",
    palette: {
      sky: "#82d8ef",
      fog: "#a6e4f2",
      horizon: "#d9f5fb",
      cabinAccent: "#4264b6",
      carpet: "#1e326b",
      light: "#fff3cd",
    },
    environment: { wind: 0.08, turbulence: 0, rain: 0, lightning: false },
  },
  "turbulent-torrent": {
    id: "turbulent-torrent",
    name: "Turbulent Torrent",
    shortName: "TURBULENT TORRENT",
    difficulty: "BREEZY",
    description: "A powerful crosswind route through fast-moving cloud banks.",
    forecast: "Strong wind · Heavy turbulence",
    icon: "≋",
    palette: {
      sky: "#4f8fa8",
      fog: "#729fb0",
      horizon: "#b8d0d7",
      cabinAccent: "#e19a3e",
      carpet: "#293b58",
      light: "#dceff2",
    },
    environment: { wind: 0.85, turbulence: 0.7, rain: 0, lightning: false },
  },
  "stormy-service": {
    id: "stormy-service",
    name: "Stormy Service",
    shortName: "STORMY SERVICE",
    difficulty: "SEVERE",
    description: "Night service inside a dramatic thunderstorm corridor.",
    forecast: "Driving rain · Thunderstorms",
    icon: "ϟ",
    palette: {
      sky: "#172746",
      fog: "#34445f",
      horizon: "#5e6b82",
      cabinAccent: "#b44f78",
      carpet: "#161c36",
      light: "#b8c8ff",
    },
    environment: { wind: 0.7, turbulence: 0.45, rain: 1, lightning: true },
  },
};

export const FLIGHT_MAP_LIST = Object.values(FLIGHT_MAPS);
