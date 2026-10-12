# Overbooked

A real-time cooperative 3D cabin-crew game for 1–4 players. Create a flight,
share its four-character code or invite link, and serve 32 passengers before
the three-minute timer expires.

## Flight maps

- **Smooth Skies** — a bright, calm daytime route and the default flight.
- **Turbulent Torrent** — a windswept route through fast cloud banks.
- **Stormy Service** — a dark thunderstorm route with driving rain and lightning.

The captain selects the map in the lobby. Map weather configurations are kept
separate so their gameplay modifiers can be developed independently.

## Rules

- Collect water, soda, chips, and the correct meat, fish, or vegetarian meal.
- Carry up to three items at once on each steward's tray.
- Serve every item shown over a passenger before their patience runs out.
- A completed order leaves trash. Take it to the bin at the front.
- Correct items earn points; wrong or duplicate service costs 50 points.
- The one-person aisle means crew must coordinate and make room.
- Earn stars at 500, 1,100, and 1,800 points.

Move with WASD or arrow keys and interact with E or Space. Hold F to turn
sideways and squeeze slowly past another steward in the one-person aisle.
Touch controls appear on phones and tablets.

## Run locally

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. Other devices on the same network can use your
computer's LAN address with port 5173.

## Production

```bash
npm run build
npm start
```

The Express server serves the built client and Socket.IO multiplayer service on
`PORT` (default `3001`). A `render.yaml` blueprint is included for deployment
to a persistent Node web service. The server currently stores active flights in
memory, so deploy one instance and expect rooms to reset when it restarts.
