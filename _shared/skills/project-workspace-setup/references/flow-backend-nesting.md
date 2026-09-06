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

→ the distribution `tap2link-app-flow-dev` goes to `docker/web/app/`. One service per Flow deployable (Tap2Link has three: `main`, `app`, `moerschen`; honey and bee have one: `web`). The base repo's `.gitignore` normally ignores the distribution folder; if not, add it to `.git/info/exclude`. **If the base repo tracks the distribution folder as a gitlink** (`git ls-files -s docker/web` shows mode `160000`, no `.gitmodules`), neither `.gitignore` nor `exclude` hides it: `git status` in the base will always say "modified" — ignore it and never `git add` it (say so in the root README).

Only the folders in `volumes:` are live. Everything else in the distribution (`bin/`, `Build/`, `Web/`, `flow`) is copied into the image by the Dockerfile's `COPY ./<distribution>/ /var/www/html/` at build time — after adding anything there (a phpunit phar, BuildEssentials), `docker compose up -d --build` again.

## 2. Read the distribution's composer.json

`require` lists the org's packages (`tap2link/app`, `honey/main`, `honey/api`, `bee/main`, `bee/frontend`, `bee/frontendapi`, `moerschen/main`, `venturelabs/*`) and `repositories` gives their git URLs. **Every org package becomes a git working copy under `Packages/Application/<PackageKey>/`** (folder = the Flow package key, e.g. `Honey.Main`, not the composer name). Private `venturelabs/*` packages are installed by composer (source install) — do not clone them by hand unless they are worked on.

Check the branches: the distribution itself may have **only `main`** (honey-dev) while it pins the packages at `dev-dev` — then the distribution's working branch is `main` and the docs must not claim `honey-dev @ dev`. The lock's `source.reference` for each org package tells you which commit the container will run; compare it with the package's `dev` head.

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

`Packages/`, `Data/`, `Configuration/` are gitignored inside the distribution, so the nested working copies never show up in its `git status`. A clone lands on the GitHub default branch (often `main`) — check out the base branch from `companies.json` before anyone works there; composer (next step) re-clones the packages on the branch the lock names anyway.

## 4. composer install (when the backend is actually set up)

Runs inside the private PHP base image (`us.gcr.io/wenzel-it-consulting/basic-docker-php:<tag>` — the tag is in the docker repo's Dockerfile; pull with the gcloud Docker credential helper), forcing source installs for the org's packages. **No SSH key goes into the container** (the earlier recipe copied the host's private key in; that is blocked for agents and unnecessary): mirror-clone every private package on the host into a composer VCS cache and mount that cache — composer clones from the cache whenever the locked commit is already in it and never contacts GitHub.

```bash
# host: one bare mirror per private package, folder name = URL with every char outside [A-Za-z0-9.] -> "-"
C=C:/code/local-docker-files/composer-cache/vcs; mkdir -p "$C"
for r in git@github.com:<org>/<Package>.git git@github.com:venture-labs/VentureLabs.<X>.git; do
  d="$C/$(echo "$r" | sed -E 's/[^A-Za-z0-9.]/-/g')"; if [ -d "$d" ]; then git -C "$d" fetch -q; else git clone -q --mirror "$r" "$d"; fi; done
# composer in the base image, cache mounted, Git Bash (MSYS_NO_PATHCONV + pwd -W for the Windows paths)
cd <abs path>/<distribution>
MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W):/var/www/html" -v "C:/code/local-docker-files/composer-cache:/tmp/composer-cache" \
  -e COMPOSER_CACHE_DIR=/tmp/composer-cache -w /var/www/html us.gcr.io/wenzel-it-consulting/basic-docker-php:<tag> \
  bash -c 'git config --global --add safe.directory "*" && composer config "preferred-install.<org-vendor>/*" source \
    && composer config "preferred-install.venturelabs/*" source && composer install --no-interaction && git checkout -- composer.json'
```

Composer **deletes and re-clones** a pre-existing `Packages/Application/<Package>` at the lock's commit, on the branch the lock names, with remotes `origin` and `composer` — commit and push local work before running it. Only `composer install` from the lock works offline like this; `composer update`/`require` re-reads every vcs repository and needs GitHub access (see §6 for the one exception).

Then:

- `Configuration/Settings.yaml`: copy the structure from `docker-<x>-dev/files/Configuration/Settings.yaml`, point DB/Redis/ES at the sidecars in `C:\code\docker-sidecars` (pick the MySQL major that production uses: `db` = 5.7, `db8` = 8), dummies for every key, no cloud-storage block (resources stay on the local filesystem). Create the database on the sidecar first.
- `Configuration/Routes.yaml`: if the distribution ships none, copy it from `docker-<x>-dev/files/Configuration/` — the containers get it from there; without it nothing routes to the packages.
- **Ports**: every compose base from the Brylliant/VOWO template binds `8082:80` / `3006:443`. Two Flow projects cannot run at once unless the second gets a `docker-compose.override.yml` (kept out of git via `.git/info/exclude`) with `ports: !override` and free host ports; write the chosen ports into the root README and `Settings.yaml`'s `baseUri`.
- `docker compose up -d --build`, then watch `docker logs <container>`: the image's supervisord `flow` program runs `doctrine:migrate`, `resource:publish`, `cache:warmup` and finally `flow:core:setfilepermissions` **without arguments, which always exits 1** — "exited: flow (exit status 1)" is expected once the earlier steps succeeded (check `./flow doctrine:migrationstatus`). MachineMaster additionally needs the migration workaround in its README §4; honey migrates cleanly.
- Smoke test = a GraphQL query against `/api/public` (or the project's equivalent). `/health-check` exists only in the dev/live nginx configs, not in the local one.

## 5. Mirror the paths

- `agents/dev-manager/companies.json` → the repo `path` is the nested package folder; `testNote` says it is nested and that `./flow` only runs in the container against the nested checkout, never in a worktree.
- Root `README.md` tree + backend section, `CLAUDE.md` repo list, `knowledge-base/architecture/system-overview.md` "Running locally".
- Root `.gitignore`: keep a guard entry for the package name (`/Honey.Main/`) with a comment that it is NOT a sibling.

## 6. Test baseline for the Dev Manager (proven on honey 2026-09-06)

The distributions have no `require-dev`, so PHPUnit and Flow's test bootstrap are missing. Add them locally without touching tracked files (all three land in gitignored folders; redo after a fresh `composer install`):

```bash
cd <abs path>/<distribution>
curl -sSL -o bin/phpunit https://phar.phpunit.de/phpunit-9.phar                                    # Flow 8.x = PHPUnit 9
git clone --depth 1 --branch <flow major.minor> https://github.com/neos/BuildEssentials.git Build/BuildEssentials
# vfsStream is demanded by the unit-test bootstrap. `composer require` would git-fetch the private vcs repos, so strip
# `repositories` from composer.json for this one call and restore composer.json + composer.lock afterwards:
MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W):/var/www/html" -w /var/www/html us.gcr.io/wenzel-it-consulting/basic-docker-php:<tag> \
  bash -c 'git config --global --add safe.directory "*"; php -r "\$j=json_decode(file_get_contents(\"composer.json\"),true);unset(\$j[\"repositories\"]);file_put_contents(\"composer.json\",json_encode(\$j,JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES));" \
    && composer require --dev --no-interaction "mikey179/vfsstream:^1.6"; git checkout -- composer.json composer.lock'
docker compose up -d --build     # bin/ and Build/ are baked into the image
```

The Dev Manager runs tests in a worktree outside the distribution, where `./flow` cannot run. The `test` command therefore starts a **throwaway container from the base image with the distribution mounted and the worktree mounted over the package path** (tmpfs on `Data/Temporary` so the running container's proxies are untouched); Flow's test class loader then reads the worktree's classes — verified with a class that existed only in the worktree:

```
bash -c "MSYS_NO_PATHCONV=1 docker run --rm -v \"<abs path>/<distribution>:/var/www/html\" -v \"$(pwd -W):/var/www/html/Packages/Application/<Package>\" --tmpfs /var/www/html/Data/Temporary -w /var/www/html us.gcr.io/wenzel-it-consulting/basic-docker-php:<tag> bash -c 'test -d Packages/Application/<Package>/Tests/Unit || { echo no Tests/Unit yet - nothing to run; exit 0; }; php bin/phpunit -c Build/BuildEssentials/PhpUnit/UnitTests.xml Packages/Application/<Package>/Tests/Unit'"
```

Unit tests only (`Neos\Flow\Tests\UnitTestCase`, `Tests/Unit/`, `testPaths: ["^Tests/"]`, `testsRunnable: true`); functional tests need a Testing database and are not covered. PHPUnit 9 exits 0 on an empty directory but 1 on a missing one ("Cannot open file") — hence the `test -d` guard while a package has no `Tests/` folder yet. A second package in the same container (e.g. `Honey.Api`) gets the same command with its own path; the other package then comes from the nested checkout (its base branch). Making PHPUnit a real `require-dev` of the distribution is a task for the project, not part of the setup.

## Where the four projects stand (2026-09-06)

| Project | Compose base | Distribution(s) | Packages nested |
|---|---|---|---|
| MachineMaster | `docker-moerschen-local` | `docker/web/moerschen-flow-dev` | `Moerschen.Main` (+ composer-installed `VentureLabs.*`); backend proven running (ports 8082/3006), no PHPUnit yet |
| Tap2Link | `docker-tap2link-local` | `docker/web/main/tap2link-flow-dev`, `docker/web/app/tap2link-app-flow-dev`, `docker/web/moerschen/tap2link-app-moerschen-flow-dev` | `Tap2Link.App` (app), `Tap2Link.Moerschen` (moerschen); composer not run yet |
| honey analysis | `docker-honey-local` | `docker/web/honey-dev` (branch `main`, gitlink in the base repo) | `Honey.Main`, `Honey.Api` (+ `VentureLabs.PasswordRecovery`); backend proven running on 8083/3007 (override), 133 migrations clean, PHPUnit baseline per §6 in `companies.json` |
| Bienenwanderung | `docker-bee-local` (2021, services commented out) | `docker/web/bee-dev` | `Bee.Main`, `Bee.Frontend`, `Bee.FrontendApi`; composer not run yet, PHP 7.4 image |
