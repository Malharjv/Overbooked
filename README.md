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
- Carry up to three items at once. Only one meal (meat, fish, or veg) can be on the tray.
- Stand at the station an item came from and press B to put it back.
- Serve every item shown over a passenger before their patience runs out.
- A completed order leaves trash. Take it to the bin at the front.
- Correct items earn points; wrong or duplicate service costs 50 points.
- The one-person aisle means crew must coordinate and make room.
- Stars depend on the route. Smooth Skies: 1,230 / 2,000 / 2,800. Turbulent Torrent: 1,080 / 1,900 / 2,550. Stormy Service: 900 / 1,750 / 2,400.

Move with WASD or arrow keys and interact with E or Space. Hold F to turn
sideways and squeeze slowly past another steward in the one-person aisle.
Touch controls appear on phones and tablets.

## Publish

Drop `netlify-ready-game.zip` onto Netlify, or deploy this folder as a site.
Netlify builds the client and the game function. Flights and the leaderboard
are stored in Netlify Blobs. No database, API key, or environment variable is
required.

## Run locally

Requires Node.js 22 or newer.

```bash
npm install
npm run dev
```

`npm run dev` starts the client only. Multiplayer requests go to
`/.netlify/functions/game`, which Netlify provides after you publish.
