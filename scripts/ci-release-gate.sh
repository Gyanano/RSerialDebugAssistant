#!/usr/bin/env bash
# Gate for the dual-platform release workflow.
# All three must pass:
#   1. The tagged commit is on origin/release
#   2. version.json changed vs the previous version tag
#   3. The pushed ref is a version tag that matches version.json
set -euo pipefail

fail() {
  echo "::error::$1"
  echo "should_build=false" >> "${GITHUB_OUTPUT:-/dev/stdout}"
  exit 1
}

TAG_REF="${GITHUB_REF_NAME:-}"
SHA="${GITHUB_SHA:-}"

echo "Evaluating release gate for ref='$TAG_REF' sha='$SHA'"

if [[ ! "$TAG_REF" =~ ^[vV][0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  fail "Condition 3 failed: '$TAG_REF' is not a version tag (expected Vx.y.z or vx.y.z)"
fi

if [[ ! -f version.json ]]; then
  fail "version.json is missing on this commit"
fi

VERSION="$(python3 -c 'import json; print(json.load(open("version.json"))["version"])')"
TAG_VERSION="${TAG_REF#[vV]}"

if [[ "$VERSION" != "$TAG_VERSION" ]]; then
  fail "Condition 3 failed: tag '$TAG_REF' does not match version.json ($VERSION)"
fi

echo "Condition 3 passed: tag $TAG_REF matches version.json $VERSION"

if ! git fetch origin refs/heads/release:refs/remotes/origin/release; then
  fail "Condition 1 failed: origin/release does not exist. Create it (see .github/BRANCHING.md)"
fi

if ! git merge-base --is-ancestor "$SHA" origin/release; then
  fail "Condition 1 failed: tagged commit $SHA is not on the release branch"
fi

echo "Condition 1 passed: $SHA is on origin/release"

# Previous version tag (excluding the tag we just pushed)
PREV_TAG="$(
  git tag -l 'V*.*.*' 'v*.*.*' --sort=-version:refname \
    | grep -Ev "^${TAG_REF}$" \
    | head -n 1 || true
)"

if [[ -z "$PREV_TAG" ]]; then
  echo "No previous version tag; treating this as the first release"
else
  echo "Previous version tag: $PREV_TAG"
  if git diff --quiet "$PREV_TAG" "$SHA" -- version.json; then
    fail "Condition 2 failed: version.json did not change since $PREV_TAG"
  fi
fi

echo "Condition 2 passed: version.json changed for this release"

# Keep the built binary's version in lockstep with version.json
CARGO_VERSION="$(python3 -c 'import re,pathlib; t=pathlib.Path("src-tauri/Cargo.toml").read_text(); print(re.search(r"^version\s*=\s*\"([^\"]+)\"", t, re.M).group(1))')"
TAURI_VERSION="$(python3 -c 'import json; print(json.load(open("src-tauri/tauri.conf.json"))["version"])')"
FRONTEND_VERSION="$(python3 -c 'import json; print(json.load(open("frontend/package.json"))["version"])')"

if [[ "$CARGO_VERSION" != "$VERSION" || "$TAURI_VERSION" != "$VERSION" || "$FRONTEND_VERSION" != "$VERSION" ]]; then
  fail "Version drift: version.json=$VERSION Cargo.toml=$CARGO_VERSION tauri.conf.json=$TAURI_VERSION frontend/package.json=$FRONTEND_VERSION"
fi

echo "version=$VERSION" >> "${GITHUB_OUTPUT:-/dev/stdout}"
echo "should_build=true" >> "${GITHUB_OUTPUT:-/dev/stdout}"
echo "All release gate conditions passed for $VERSION"
