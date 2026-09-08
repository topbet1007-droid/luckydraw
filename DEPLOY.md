# Hosting

The site is static — HTML, CSS, images, a sound and `users.json`. It is hosted
on **Vercel**, which redeploys on every push to `main` in about 30 seconds.

**Live:** <https://luckydraws-nine.vercel.app>
**Repo:** <https://github.com/topbet1007-droid/luckydraw>

## How a push becomes a deploy

1. You push to `main` (GitHub Desktop, or `git push`)
2. Vercel sees the push and starts a build
3. The build runs `node tools/check.mjs` — **this is the safety gate**
4. If the check passes, the new files go live. If it fails, the build stops and
   Vercel keeps serving the previous version

Step 3 is why a malformed `users.json` can no longer blank the site at 8pm. The
worst case is that your change doesn't go out, and the site carries on showing
what it showed before.

The build log also prints `tonight's reveal: <name>`, which is `check.mjs`
saying what the site will land on at 20:00. Worth a glance after every push.

## Project settings

Set once, at import. Vercel → project → Settings → Build & Deployment:

| Setting | Value |
|---|---|
| Framework Preset | `Other` |
| Root Directory | `./` |
| Build Command | `node tools/check.mjs` *(override on)* |
| Output Directory | `.` *(override on)* |
| Install Command | *(override off)* |

The Output Directory override matters — without it Vercel looks for a `public`
folder, doesn't find one, and fails the build.

## GitHub Pages — retired

The site ran on GitHub Pages first. It has been unpublished, and
`.github/workflows/pages.yml` has had its `push:` trigger removed so it cannot
fire on its own. The workflow is still there and still runnable from the
Actions tab if Pages is ever needed again — re-add the trigger and switch
Settings → Pages back on.

Pages worked; it was just slower. Two to three minutes from push to live,
against Vercel's thirty seconds, which is the difference between a 19:45 and a
19:55 cutoff for publishing the winner.

## The clock

The page reads the Manila time from the `Date` header on the `users.json`
response — the request it was making anyway. No third-party time API to go
down and strand the page, and no dependence on the viewer's own clock unless
that header is missing.

This works on any host that serves a correct `Date` header, which is all of
them. It was the same on Pages.

## If you ever need a custom domain

Vercel → project → **Domains** → **Add**. It walks you through the DNS record.
`luckydraws-nine.vercel.app` is a generated name and fine for internal use, but
worth replacing with something like `draw.yourdomain.com` for anything shown to
players.

## Daily use

Nothing here changes day to day. See [tools/README.md](tools/README.md) for the
edit-check-commit-push routine.
