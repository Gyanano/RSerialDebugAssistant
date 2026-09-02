# Branching and release

This repo uses standard **git-flow** (with `main` as the production branch instead of the historical `master`).

## Branches

| Branch | Role |
|--------|------|
| `main` | Production line (git-flow *master*). Only merge work that is meant to ship |
| `develop` | Day-to-day development (git-flow *develop*). GitHub default branch |
| `feature/<name>` | New work, branched from `develop` |
| `bugfix/<name>` | Non-urgent fixes, branched from `develop` |
| `release/<x.y.z>` | Release preparation / version bump, branched from `develop` |
| `hotfix/<x.y.z>` | Production fixes, branched from `main` |

Do not commit directly to `main`. Open a pull request.

```
feature/* ──PR──► develop ──PR──► release/x.y.z ──PR──► main ──tag Vx.y.z──► CI
bugfix/*  ──PR──► develop            │
hotfix/*  ──PR──► main ──tag──► CI   └─merge back──► develop
                  └─merge back──► develop
```

## First-time setup

The workflow file must exist on the tagged commit, so create `main` (production) from the commit that already contains `.github/workflows/release.yml` (after this work is on `develop`):

```bash
git fetch origin
git checkout develop
git pull
git checkout -b main
git push -u origin main
```

Then in GitHub:

1. Set `develop` as the default branch, protect `main` (PR required, no force-push).
2. Settings → Actions → General → Workflow permissions → **Read and write**. Without this, attaching `.exe` / `.dmg` to the GitHub Release fails.

Existing tags such as `V1.3.1` will not rebuild automatically. The next *new* version tag is what starts CI.

## How a version ships

All three must be true or GitHub Actions will not build installers:

1. The commit lives on `main` (merged there, not only on `develop`).
2. `version.json` changed compared with the previous version tag.
3. A version tag `Vx.y.z` or `vx.y.z` is pushed, and it matches `version.json`.

Suggested sequence:

```bash
# 1. Branch release/x.y.z from develop: bump version.json, src-tauri/Cargo.toml,
#    src-tauri/tauri.conf.json, and frontend/package.json to the same x.y.z
git checkout develop
git checkout -b release/1.4.0

# 2. Open a PR into main and merge it

# 3. Tag the merge commit on main, then push the tag
git checkout main
git pull
git tag V1.4.0
git push origin V1.4.0

# 4. Merge main back into develop so development is not left behind
```

Pushing the tag is what starts the workflow. The gate job (`scripts/ci-release-gate.sh`) then re-checks the three conditions. The production branch it verifies defaults to `main` and can be overridden with the `RELEASE_GATE_PROD_BRANCH` environment variable. If any check fails, Windows/macOS builds are skipped.

Do not add version lines to `README.md` / `README.zh-CN.md`. Those files link to [Releases](https://github.com/Gyanano/RSerialDebugAssistant/releases); CI fills the GitHub Release body from commits since the previous tag.

Artifacts:

- Windows x64 NSIS `.exe` — unsigned; this is what the in-app updater looks for
- macOS Apple Silicon `.dmg` — Developer ID signed and notarized when the Apple secrets are present

macOS signing uses GitHub Actions secrets (`APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_TEAM_ID`, `APPLE_API_ISSUER`, `APPLE_API_KEY`, `APPLE_API_KEY_P8`). The Windows job does not receive those secrets.

Intel Mac `.dmg` is not built yet.

Hotfix: branch `hotfix/x.y.z` from `main`, bump the patch version, PR back into `main`, tag, then merge `main` back into `develop` so development is not left behind.
