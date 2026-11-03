# Deployment

Hearth & Home 3D is published as a static GitHub Pages site. There is no server, build job in the repository, environment variable or secret.

## Site facts

| Item | Value |
| --- | --- |
| Live URL | <https://somphol.github.io/hearth-and-home-3d/> |
| Repository | <https://github.com/somphol/hearth-and-home-3d> |
| Default branch | `main` |
| Pages source | Deploy from a branch → `main` → `/ (root)` |
| HTTPS | Served over HTTPS; confirm **Enforce HTTPS** in Pages settings |
| Custom domain | None (no `CNAME`) |
| Jekyll | Disabled by the empty `.nojekyll` at the repo root |
| Build | GitHub-managed `pages-build-deployment` workflow; no workflow file in this repo |

The repository contains no `CNAME`, no `vercel.json`, no Netlify config and no Pages workflow. Pushes to `main` trigger GitHub's managed Pages build. The build job checks out the branch and uploads the root as the site artifact; `.nojekyll` suppresses Jekyll processing.

> The Pages settings API requires authentication, so the branch/folder line above is confirmed from the managed workflow, the empty `.nojekyll`, and the served file set rather than from a settings read. Re-check **Settings → Pages** in the GitHub UI if the site ever behaves unexpectedly.

## What is published

The entire repository root is served, including:

- `index.html`, `style.css`, `script.js`
- `preview-fireplace.jpg`, `preview-ocean.jpg`, `preview-sky.jpg`
- `docs/` (social card and the Markdown guides)
- `README.md`, `AGENTS.md`, `CHANGELOG.md`, `LICENSE`, policies
- `SESSION_STATE.json` (historical build record; no secrets)
- `robots.txt`, `sitemap.xml`, `.nojekyll`
- `skills/` (the reusable build skill and its template)

All source is public by design. Do not add `.env` files, tokens, private logs, analytics IDs or personal data anywhere in the repository, even in files you think are not linked from the page.

Runtime dependencies are external and not published by this repo:

- `https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js`
- `https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js`
- `https://fonts.googleapis.com/...` (Fraunces and Inter)

If those CDNs are blocked, the DOM and timer still load but `initThree()` throws and the loader reports that the fire could not be lit.

## Deploying a change

```bash
cd ~/Projects/hearth-and-home-3d
node --check script.js
node scripts/check.mjs
git add -A
git commit -m "docs: describe the change"
git push origin main
```

There is nothing else to run. Pages rebuilds automatically after the push. Do not force-push `main`, and do not create a second deployment while GitHub reports the previous one as `in progress` — that produced a transient `Deployment request failed ... due to in progress deployment` error during the original release. Waiting and letting the queued run finish resolved it.

Typical build time after a push is under a minute; the live copy can lag by a few minutes behind the commit.

## Verifying the deployment

```bash
curl -sI https://somphol.github.io/hearth-and-home-3d/ | head -12
curl -s  https://somphol.github.io/hearth-and-home-3d/ | grep -m1 '<title>'
curl -sI https://somphol.github.io/hearth-and-home-3d/script.js | head -5
curl -sI https://somphol.github.io/hearth-and-home-3d/docs/social-card.png | head -5
curl -s  https://raw.githubusercontent.com/somphol/hearth-and-home-3d/main/README.md | head -5
```

Expected:

- `/` returns `200` and the title contains `Hearth & Home 3D`.
- `script.js`, `style.css` and the preview images return `200`.
- The page source contains `APP.version` 1.1.0 behaviour (`HearthHome3D.version === "1.1.0"` in the console).
- The rendered page clears the loader and shows the fireplace on a WebGL-capable browser.
- `https://somphol.github.io/hearth-and-home-3d/sitemap.xml` and `/robots.txt` return `200`.

Check the live site, not only local files, after any change to `index.html`, `style.css`, `script.js`, or a URL in `README.md`.

## Caching

Observed response headers from GitHub Pages include:

```text
cache-control: max-age=600
etag: "..."
```

Pages/CDN caches for about ten minutes and revalidates with the ETag afterwards. A hard refresh (`Cmd-Shift-R` / `Ctrl-Shift-R`) or a private window is enough to see a new deploy immediately. Do not add cache-busting query strings to the source; they would break the static link checks and are unnecessary.

## Custom domain

There is no custom domain. If one is added later:

1. Add the domain in **Settings → Pages → Custom domain** and let GitHub create the `CNAME` file.
2. Configure the DNS records GitHub shows (apex `A`/`AAAA` or `www` `CNAME`).
3. Enable **Enforce HTTPS** once the certificate is issued.
4. Update the absolute URLs in `index.html` (canonical, `og:url`, `og:image`, Twitter image), `README.md`, `AGENTS.md`, `sitemap.xml`, `robots.txt` and `SESSION_STATE.json`.

Until then, keep the `somphol.github.io/hearth-and-home-3d` URLs consistent.

## Rollback

Use a revert commit; do not rewrite published history.

```bash
git log --oneline -5
git revert <bad-commit-sha>
git push origin main
```

Pages rebuilds from the revert. If a deploy itself failed (not the code), re-run the failed `pages-build-deployment` workflow from the Actions tab, or push an empty commit only as a last resort:

```bash
git commit --allow-empty -m "chore: redeploy Pages"
git push origin main
```

If the repository is renamed or transferred, the project URL changes. Update every absolute URL listed under **Custom domain** and re-run `node scripts/check.mjs`.

## Troubleshooting

| Symptom | Likely cause | Action |
| --- | --- | --- |
| 404 on the project URL | Pages disabled, wrong branch/folder, or repo renamed | Settings → Pages: branch `main`, folder `/ (root)`; confirm the repository name |
| Old page after a push | Pages/CDN `max-age=600` | Wait, hard-refresh, or check the commit SHA in the Actions run |
| Loader says "The fire could not be lit" | Three.js CDN blocked or WebGL unavailable | Check the console/network; try another network; verify WebGL support |
| Page loads but no 3D | `THREE` undefined (CDN failure) | The app catches this and shows a toast; restore CDN access |
| "Tap to hear" never changes | No user gesture, or AudioContext blocked | Click or press a key on the page; check site sound permissions |
| `Deployment request failed ... in progress` | Two Pages deployments queued at once | Wait for the first to finish; re-run the failed workflow |
| Markdown links 404 on GitHub | Renamed doc or wrong relative path | Run `node scripts/check.mjs`; fix the link |
| Social card does not update | Crawler cache (X/Twitter/Facebook) | Re-scrape through the platform's card validator; the file itself is already updated |

## Security and privacy

- No secrets, tokens, API keys or credentials belong in this repository.
- No analytics, tracking pixels, cookies or third-party scripts beyond the CDN libraries and Google Fonts.
- Study history stays in `localStorage` unless the user explicitly downloads it. Imported files are read locally with `FileReader`.
- The site is public and MIT-licensed; treat every committed file as public.
