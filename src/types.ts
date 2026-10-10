export type ItemName = "water" | "soda" | "chips" | "meat" | "fish" | "veg";

export interface HeldItem {
  type: "item" | "trash";
  item: ItemName | "trash";
}

export interface Player {
  id: string;
  name: string;
  color: string;
  x: number;
  z: number;
  facing: number;
  squeezing: boolean;
  held: HeldItem | null;
}

export interface Order {
  id: string;
  seatId: number;
  items: ItemName[];
  served: ItemName[];
  expiresAt: number;
}

export interface Mess {
  id: string;
  x: number;
  z: number;
}

export interface RoomState {
  code: string;
  hostId: string;
  status: "lobby" | "playing" | "finished";
  score: number;
  timeLeft: number;
  players: Player[];
  orders: Order[];
  messes: Mess[];
}
