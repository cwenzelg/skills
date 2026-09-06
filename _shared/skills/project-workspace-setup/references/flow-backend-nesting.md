# Nesting a Neos Flow backend inside its compose base

Applies to every PHP/Flow project (MachineMaster, Tap2Link, honey analysis, Bienenwanderung). The pattern: **compose base → service folder → distribution → `Packages/Application/<Package>`**.

## 1. Read the compose base

`docker-<x>-local/docker-compose.yml` names the service folders and the distribution folder in its `volumes:`:

```yaml
services:
  app:
    build: { context: docker/web/app }
    volumes:
      - ./docker/web/app/tap2link-app-flow-dev/Packages:/var/www/html/Packages
      - ./docker/web/app/tap2link-app-flow-dev/Data/Persistent:/var/www/html/Data/Persistent
      - ./docker/web/app/tap2link-app-flow-dev/Configuration:/var/www/html/Configuration
```

→ the distribution `tap2link-app-flow-dev` goes to `docker/web/app/`. One service per Flow deployable (Tap2Link has three: `main`, `app`, `moerschen`; honey and bee have one: `web`). The base repo's `.gitignore` normally ignores the distribution folder; if not, add it to `.git/info/exclude`.

## 2. Read the distribution's composer.json

`require` lists the org's packages (`tap2link/app`, `honey/main`, `honey/api`, `bee/main`, `bee/frontend`, `bee/frontendapi`, `moerschen/main`, `venturelabs/*`) and `repositories` gives their git URLs. **Every org package becomes a git working copy under `Packages/Application/<PackageKey>/`** (folder = the Flow package key, e.g. `Honey.Main`, not the composer name). Private `venturelabs/*` packages are installed by composer (source install) — do not clone them by hand unless they are worked on.

Live distributions (`*-flow-live`, `bee-flow`, `honey-live`) are not nested and not run; keep them as siblings for reference or skip them.

## 3. Clone / move

```bash
cd C:/code/<project>/docker-<x>-local/docker/web/<service>
git clone git@github.com:<org>/<distribution>.git
mkdir -p <distribution>/Packages/Application
git clone git@github.com:<org>/<Package>.git <distribution>/Packages/Application/<Package>
git -C <distribution>/Packages/Application/<Package> remote add composer "$(git -C … remote get-url origin)"
git -C … checkout <working branch>     # dev, or what the live composer.lock / cloudbuild says
```

`Packages/`, `Data/`, `Configuration/` are gitignored inside the distribution, so the nested working copies never show up in its `git status`.

## 4. composer install (when the backend is actually set up)

Runs inside the private PHP base image (`us.gcr.io/wenzel-it-consulting/basic-docker-php:<tag>` — the tag is in the docker repo's Dockerfile; pull with the gcloud Docker credential helper) with the host SSH key, forcing source installs for the org's packages:

```bash
docker run --rm -v "<abs path>/<distribution>:/var/www/html" -v ~/.ssh/id_ed25519:/tmp/id_ed25519:ro -w /var/www/html \
  us.gcr.io/wenzel-it-consulting/basic-docker-php:<tag> bash -c 'mkdir -p /root/.ssh && cp /tmp/id_ed25519 /root/.ssh/ && chmod 600 /root/.ssh/id_ed25519 \
    && ssh-keyscan github.com >> /root/.ssh/known_hosts && composer config preferred-install.<org-vendor>/* source \
    && composer config "preferred-install.venturelabs/*" source && composer install && git checkout -- composer.json'
```

Composer **replaces** a pre-existing `Packages/Application/<Package>` with its own checkout (remote named `composer`) — commit and push local work before running it. Then `Configuration/Settings.yaml` (copy the structure from `docker-<x>-dev/files/Configuration/Settings.yaml`, point DB/Redis/ES at the sidecars in `C:\code\docker-sidecars`, dummies for keys), `docker compose up -d --build`, `./flow doctrine:migrate`, the project's `setup:*` commands. MachineMaster's README §4 has the proven run incl. the migration workaround.

## 5. Mirror the paths

- `agents/dev-manager/companies.json` → the repo `path` is the nested package folder; `testNote` says it is nested and that a worktree outside the distribution cannot run `./flow`.
- Root `README.md` tree + backend section, `CLAUDE.md` repo list, `knowledge-base/architecture/system-overview.md` "Running locally".
- Root `.gitignore`: keep a guard entry for the package name (`/Honey.Main/`) with a comment that it is NOT a sibling.

## Where the four projects stand (2026-09-06)

| Project | Compose base | Distribution(s) | Packages nested |
|---|---|---|---|
| MachineMaster | `docker-moerschen-local` | `docker/web/moerschen-flow-dev` | `Moerschen.Main` (+ composer-installed `VentureLabs.*`); backend proven running |
| Tap2Link | `docker-tap2link-local` | `docker/web/main/tap2link-flow-dev`, `docker/web/app/tap2link-app-flow-dev`, `docker/web/moerschen/tap2link-app-moerschen-flow-dev` | `Tap2Link.App` (app), `Tap2Link.Moerschen` (moerschen); composer not run yet |
| honey analysis | `docker-honey-local` | `docker/web/honey-dev` | `Honey.Main`, `Honey.Api`; composer not run yet |
| Bienenwanderung | `docker-bee-local` (2021, services commented out) | `docker/web/bee-dev` | `Bee.Main`, `Bee.Frontend`, `Bee.FrontendApi`; composer not run yet, PHP 7.4 image |
