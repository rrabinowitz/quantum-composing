#!/usr/bin/env bash
# Build Overtone Field.app and optionally copy it to /Applications.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

INSTALL=0
for arg in "$@"; do
  case "$arg" in
    --install) INSTALL=1 ;;
    -h|--help) echo "Usage: $0 [--install]"; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This script must run on macOS." >&2
  exit 1
fi

APP_NAME="Overtone Field"
BUNDLE_ID="com.robertrabinowitz.overtonefield"
VERSION="$(node -p "require('./package.json').version")"
OUT_DIR="$ROOT/dist-macos"
APP_PATH="$OUT_DIR/${APP_NAME}.app"

echo "==> Building web assets"
npm run build

echo "==> Drawing app icon"
ICON_SRC="$(mktemp -d)/icon.png"
python3 - "$ICON_SRC" <<'PY'
import struct, sys, zlib
path = sys.argv[1]
w = h = 1024
raw = bytearray()
for y in range(h):
    for x in range(w):
        cx, cy = x - 512, y - 512
        r = (cx * cx + cy * cy) ** 0.5
        if r < 470:
            t = r / 470
            red = int(244 - 40 * t)
            green = int(239 - 50 * t)
            blue = int(228 - 30 * t)
            if 430 < r < 455:
                red, green, blue = 194, 69, 45
            raw += bytes((red, green, blue))
        else:
            raw += bytes((244, 239, 228))
# write PNG
def chunk(tag, data):
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
rows = b"".join(b"\x00" + bytes(raw[y * w * 3:(y + 1) * w * 3]) for y in range(h))
png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(rows, 9)) + chunk(b"IEND", b"")
open(path, "wb").write(png)
PY

ICONSET="$(mktemp -d)/AppIcon.iconset"
mkdir -p "$ICONSET"
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" "$ICON_SRC" --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
  double=$((size * 2))
  sips -z "$double" "$double" "$ICON_SRC" --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null
done
ICNS="$OUT_DIR/AppIcon.icns"
mkdir -p "$OUT_DIR"
iconutil -c icns "$ICONSET" -o "$ICNS"

echo "==> Compiling Swift wrapper"
rm -rf "$APP_PATH"
mkdir -p "$APP_PATH/Contents/MacOS" "$APP_PATH/Contents/Resources/www"
cp -R "$ROOT/dist/." "$APP_PATH/Contents/Resources/www/"
cp "$ICNS" "$APP_PATH/Contents/Resources/AppIcon.icns"
swiftc -O -parse-as-library \
  -target arm64-apple-macos13.0 \
  "$ROOT/macos-wrapper/OvertoneField.swift" \
  -o "$APP_PATH/Contents/MacOS/${APP_NAME}"

cat > "$APP_PATH/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleDisplayName</key>
  <string>${APP_NAME}</string>
  <key>CFBundleExecutable</key>
  <string>${APP_NAME}</string>
  <key>CFBundleIconFile</key>
  <string>AppIcon</string>
  <key>CFBundleIdentifier</key>
  <string>${BUNDLE_ID}</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>${APP_NAME}</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>${VERSION}</string>
  <key>CFBundleVersion</key>
  <string>${VERSION}</string>
  <key>LSApplicationCategoryType</key>
  <string>public.app-category.music</string>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>NSPrincipalClass</key>
  <string>NSApplication</string>
</dict>
</plist>
PLIST

echo "==> Ad-hoc codesign"
codesign --force --deep --sign - "$APP_PATH"
xattr -cr "$APP_PATH" || true

if [[ "$INSTALL" == "1" ]]; then
  echo "==> Installing to /Applications"
  rm -rf "/Applications/${APP_NAME}.app"
  cp -R "$APP_PATH" "/Applications/${APP_NAME}.app"
  xattr -cr "/Applications/${APP_NAME}.app" || true
  codesign --force --deep --sign - "/Applications/${APP_NAME}.app"
fi

echo "Built $APP_PATH"
