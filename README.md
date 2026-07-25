# Talaash — Night Drive Experience

The hero landing page for Talaash, Jai Hind College's annual management fest.
A 3D night-ride sequence (React Three Fiber) leads into a set of stat billboards
and a finale logo board.

This project is self-contained — it has no dependency on any third-party
editor or hosted platform, and can be developed, built, and deployed
independently.

## Built with

- TanStack Start (React)
- TypeScript
- React Three Fiber / Three.js
- Tailwind CSS
- Deployed as a Cloudflare Worker (see `vite.config.ts` — the Nitro/server
  preset targets `cloudflare-module` directly)

## Development

You need Node.js and npm.

```sh
npm install
npm run dev
```

## Build

```sh
npm run build
npm run preview
```

## Deploy

The app builds to a standard Cloudflare Worker output. Deploy it with
Wrangler (or the Cloudflare dashboard's Git integration) the same way you
would any other Worker/Pages project — no external build service required.
