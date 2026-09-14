# Connecting this repo to Vercel (leaf 0.a.i.zi)

The Next.js app now lives at the **repo root**. The old Symfony app was
moved to `legacy-symfony/` so it's out of the way. This means Vercel's
import flow auto-detects the Next.js framework with no configuration —
there's no "Root Directory" field to set, now or on any future import.

Steps:

1. Go to https://vercel.com/new and import this GitHub repo
   (`Zapier-codes/D-Store`).
2. Vercel detects Next.js automatically from the root `package.json` —
   accept the defaults and deploy. Nothing to point or configure.
3. Every push to any branch/PR now gets an automatic preview
   deployment; pushes to `master` deploy to production.

Once this is done, leaf `0.a.i.zo` (confirm a live preview URL renders
end-to-end) can be checked off against the real deployed URL.

