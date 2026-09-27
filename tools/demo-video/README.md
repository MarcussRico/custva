# Demo video

Makes the café walkthrough video from the real merchant app. Three steps:

1. **Data.** `cd apps/api && ./node_modules/.bin/tsx scripts/seed-cafe-simulation.ts`
   builds the synthetic "Filter Room" café (merchant `…0010`).
2. **Capture.** With the API on :4000 and the merchant app on :3100
   (`next dev -p 3100`), run `node capture.mjs`. It drives the app with
   Playwright, records two counter visits live, and writes `shots/` plus
   `manifest.json` (every annotated element's position, and the dashboard
   numbers at the moment each screen was captured).
3. **Render.** `node render.mjs stills 22 60 118` renders review frames into
   `stills/`; `node render.mjs video out.mp4` renders all frames at 30 fps
   and pipes them to ffmpeg.

`compose.html` is the edit: scenes, camera moves, captions, arrows and the
"who gets a WhatsApp" explainer, all computed from the time `t`, so every
frame is reproducible. A camera key is the start of a 1.3 s move; keep every
note inside a hold between moves.

Needs: `npm i playwright` (Chromium), an ffmpeg with libx264 (`FFMPEG=` or on
PATH), and a merchant access token for the demo shop in `.token` or
`CUSTVA_DEMO_TOKEN` — a JWT signed with the local `JWT_ACCESS_SECRET` for a
`merchant_admin` user of merchant `00000000-0000-0000-0000-000000000010`.
Local only; the token and all outputs are git-ignored.

Everything it shows is synthetic. Capturing records real visits in the
database, so reseed before capturing again.
