# Branching and release

This repo uses a lightweight git-flow. `main` stays the default working branch; shipping happens on `release`.

## Branches

| Branch | Role |
|--------|------|
| `main` | Day-to-day development (git-flow *develop*) |
| `release` | Shippable line (git-flow *main*). Only merge work that is meant to ship |
| `feature/<name>` | New work, branched from `main` |
| `hotfix/<name>` | Production fixes, branched from `release` |

Do not commit directly to `release`. Open a pull request.

```
feature/* ──PR──► main ──PR (version bump)──► release ──tag Vx.y.z──► CI
hotfix/*  ──PR──► release ──tag──► CI
                    └──PR──► main
```

## First-time setup

The workflow file must exist on the tagged commit, so create `release` from the commit that already contains `.github/workflows/release.yml` (after this work is on `main`):

```bash
git fetch origin
git checkout main
git pull
git checkout -b release
git push -u origin release
```

Then in GitHub:

1. Protect `release` (PR required, no force-push).
2. Settings → Actions → General → Workflow permissions → **Read and write**. Without this, attaching `.exe` / `.dmg` to the GitHub Release fails.

Existing tags such as `V1.3.1` will not rebuild automatically. The next *new* version tag is what starts CI.

## How a version ships

All three must be true or GitHub Actions will not build installers:

1. The commit lives on `release` (merged there, not only on `main`).
2. `version.json` changed compared with the previous version tag.
3. A version tag `Vx.y.z` or `vx.y.z` is pushed, and it matches `version.json`.

Suggested sequence:

```bash
# 1. On a branch from main: bump version.json, src-tauri/Cargo.toml,
#    src-tauri/tauri.conf.json, and frontend/package.json to the same x.y.z
git checkout main
git checkout -b release/1.4.0

# 2. Open a PR into release and merge it

# 3. Tag the merge commit on release, then push the tag
git checkout release
git pull
git tag V1.4.0
git push origin V1.4.0
```

Pushing the tag is what starts the workflow. The gate job then re-checks the other two conditions. If any check fails, Windows/macOS builds are skipped.

Artifacts:

- Windows x64 NSIS `.exe` — unsigned; this is what the in-app updater looks for
- macOS Apple Silicon `.dmg` — Developer ID signed and notarized when the Apple secrets are present

macOS signing uses GitHub Actions secrets (`APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_TEAM_ID`, `APPLE_API_ISSUER`, `APPLE_API_KEY`, `APPLE_API_KEY_P8`). The Windows job does not receive those secrets.

Intel Mac `.dmg` is not built yet.

Hotfix: branch from `release`, bump the patch version, PR back into `release`, tag, then PR `release` into `main` so development is not left behind.
