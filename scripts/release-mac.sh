#!/bin/sh
# Cuts a MonoCode release of the enemyrr fork. It bumps the version, builds a
# signed and notarized Apple silicon app, and publishes a dmg and an updater
# feed as a GitHub release on enemyrr/monocode. Installed copies update
# themselves from the latest release's latest.json.
#
# Tags are named mono-v<version> because the upstream workflows trigger on v*
# tags.
#
# The build packages whatever is in the working tree, so run it from a checkout
# that no agent edits.
#
# Usage: scripts/release-mac.sh [patch|minor|major]
#
# One-time setup:
#   xcrun notarytool store-credentials buildr --apple-id APPLE_ID --team-id 6ECNB95892
#   ./node_modules/.bin/tauri signer generate -w ~/.tauri/monocode-enemyrr.key -p "" --ci
set -eu

MODE="${1:-patch}"
REPO=enemyrr/monocode
IDENTITY="Developer ID Application: RIBBAN AB (6ECNB95892)"
NOTARY_PROFILE="${MONOCODE_NOTARY_PROFILE:-buildr}"
KEY="${MONOCODE_UPDATER_KEY:-$HOME/.tauri/monocode-enemyrr.key}"

cd "$(dirname "$0")/.."
export PATH="/opt/homebrew/opt/rustup/bin:$HOME/.cargo/bin:$PATH"
export CARGO_TARGET_DIR="$PWD/target"
unset APPLE_ID APPLE_PASSWORD APPLE_API_KEY APPLE_API_ISSUER

fail() {
  echo "$1" >&2
  exit 1
}

[ -z "$(git status --porcelain)" ] || fail "Commit or stash your changes first."
git fetch -q origin main
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || fail "Check out origin/main first."
[ -f "$KEY" ] && [ -f "$KEY.pub" ] || fail "Generate the updater key first. See the header of this script."
xcrun notarytool history --keychain-profile "$NOTARY_PROFILE" >/dev/null ||
  fail "Store the $NOTARY_PROFILE notarytool profile first. See the header of this script."

VERSION=$(node -e '
  const [major, minor, patch] = require("./package.json").version.split(".").map(Number);
  const next = { major: [major + 1, 0, 0], minor: [major, minor + 1, 0], patch: [major, minor, patch + 1] }[process.argv[1]];
  if (!next) process.exit(1);
  console.log(next.join("."));
' "$MODE") || fail "Usage: scripts/release-mac.sh [patch|minor|major]"
TAG="mono-v$VERSION"
DOWNLOAD="https://github.com/$REPO/releases/download/$TAG"
if gh release view "$TAG" -R "$REPO" >/dev/null 2>&1; then
  fail "Release $TAG already exists."
fi

node scripts/bump-version.mjs "$VERSION"

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
node -e '
  const [identity, pubkey, endpoint] = process.argv.slice(1);
  console.log(JSON.stringify({
    build: { beforeBuildCommand: "./node_modules/.bin/tsc && ./node_modules/.bin/vite build" },
    bundle: { createUpdaterArtifacts: false, macOS: { signingIdentity: identity } },
    plugins: { updater: { pubkey, endpoints: [endpoint] } },
  }));
' "$IDENTITY" "$(cat "$KEY.pub")" "https://github.com/$REPO/releases/latest/download/latest.json" \
  > "$WORK/release.conf.json"

./node_modules/.bin/tauri build --bundles app --config "$WORK/release.conf.json"

APP="$CARGO_TARGET_DIR/release/bundle/macos/MonoCode.app"
[ -d "$APP" ] || fail "Missing $APP."

# Tauri notarizes only with Apple ID or API key variables. Notarize with the
# keychain profile instead, then staple the ticket to the app.
ditto -c -k --keepParent "$APP" "$WORK/notarize.zip"
xcrun notarytool submit "$WORK/notarize.zip" --keychain-profile "$NOTARY_PROFILE" --wait |
  tee "$WORK/notary.log"
grep -q "status: Accepted" "$WORK/notary.log" || fail "Notarization was not accepted."
xcrun stapler staple "$APP"
spctl --assess --type exec "$APP" || fail "Gatekeeper rejects MonoCode.app."

# The updater archive and dmg are built from the stapled app, so both carry the
# ticket.
OUT="$WORK/out"
mkdir -p "$OUT" "$WORK/dmg"
ARCHIVE="MonoCode_aarch64.app.tar.gz"
DMG="MonoCode_${VERSION}_aarch64.dmg"
COPYFILE_DISABLE=1 tar -czf "$OUT/$ARCHIVE" -C "$(dirname "$APP")" MonoCode.app
./node_modules/.bin/tauri signer sign -f "$KEY" -p "" "$OUT/$ARCHIVE"
ditto "$APP" "$WORK/dmg/MonoCode.app"
ln -s /Applications "$WORK/dmg/Applications"
hdiutil create -quiet -volname MonoCode -srcfolder "$WORK/dmg" -ov -format UDZO "$OUT/$DMG"

node -e '
  const { readFileSync } = require("node:fs");
  const [version, tag, repo, url, sig] = process.argv.slice(1);
  console.log(JSON.stringify({
    version,
    notes: `https://github.com/${repo}/releases/tag/${tag}`,
    pub_date: new Date().toISOString(),
    platforms: { "darwin-aarch64": { signature: readFileSync(sig, "utf8").trim(), url } },
  }, null, 2));
' "$VERSION" "$TAG" "$REPO" "$DOWNLOAD/$ARCHIVE" "$OUT/$ARCHIVE.sig" > "$OUT/latest.json"

git add -- package.json package-lock.json Cargo.toml Cargo.lock src-tauri/tauri.conf.json
git commit -m "chore(release): MonoCode $VERSION"
git push origin HEAD:main

gh release create "$TAG" -R "$REPO" --target main --title "MonoCode $VERSION" --generate-notes \
  "$OUT/$DMG" "$OUT/$ARCHIVE" "$OUT/$ARCHIVE.sig" "$OUT/latest.json"

echo "Published https://github.com/$REPO/releases/tag/$TAG"
echo "Install: ditto \"$APP\" /Applications/MonoCode.app"
