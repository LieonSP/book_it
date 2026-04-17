/**
 * __tests__/issue-47-favicon.test.ts
 *
 * Vitest static tests for Issue #47 — Change favicon to house logo.
 *
 * Strategy: no DOM rendering needed. We verify file-system state and PNG
 * metadata by reading raw bytes. PNG stores width and height as big-endian
 * 32-bit integers at fixed offsets in the IHDR chunk (bytes 16–23), so we
 * can check dimensions without any image-processing dependency.
 *
 * Scenarios covered:
 *  1  app/icon.png exists and is a valid PNG (magic bytes check)
 *  2  app/icon.png is square 512×512 (no distortion from 940×734 source)
 *  3  app/favicon.ico no longer exists (default Next.js icon fully replaced)
 *  4  app/icon.png has an alpha channel (RGBA — same as source logo)
 */

import { describe, it, expect } from "vitest"
import { existsSync, readFileSync } from "fs"
import { resolve } from "path"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROOT = resolve(__dirname, "..")

/**
 * Reads the width and height stored in a PNG file's IHDR chunk.
 *
 * PNG file layout (bytes):
 *   0–7   : PNG magic signature  (8 bytes)
 *   8–11  : IHDR chunk length    (4 bytes, always 13 for IHDR)
 *   12–15 : Chunk type "IHDR"    (4 bytes, ASCII)
 *   16–19 : Image width          (4 bytes, big-endian uint32)
 *   20–23 : Image height         (4 bytes, big-endian uint32)
 *   24    : Bit depth            (1 byte)
 *   25    : Colour type          (1 byte)  — 2=RGB, 6=RGBA
 *
 * This lets us check dimensions without importing any image library.
 */
function readPngDimensions(filePath: string): { width: number; height: number; colourType: number } {
  const buf = readFileSync(filePath)
  const width = buf.readUInt32BE(16)
  const height = buf.readUInt32BE(20)
  const colourType = buf.readUInt8(25)
  return { width, height, colourType }
}

/**
 * Returns true when the first 8 bytes match the PNG magic signature.
 */
function isPng(filePath: string): boolean {
  const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const buf = readFileSync(filePath)
  return buf.slice(0, 8).equals(PNG_MAGIC)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Issue #47 — Favicon: house logo replaces default Next.js icon", () => {

  const iconPath = resolve(ROOT, "app/icon.png")
  const faviconPath = resolve(ROOT, "app/favicon.ico")

  // -------------------------------------------------------------------------
  // Scenario 3 — Default favicon is fully removed
  // Given: the dev agent deleted app/favicon.ico
  // When:  we check the file system
  // Then:  app/favicon.ico must not exist
  // -------------------------------------------------------------------------
  it("Scenario 3 — app/favicon.ico does NOT exist (default icon fully removed)", () => {
    expect(existsSync(faviconPath)).toBe(false)
  })

  // -------------------------------------------------------------------------
  // Scenario 1a — app/icon.png exists
  // Given: the dev agent created app/icon.png
  // When:  we check the file system
  // Then:  app/icon.png must exist
  // -------------------------------------------------------------------------
  it("Scenario 1 — app/icon.png exists", () => {
    expect(existsSync(iconPath)).toBe(true)
  })

  // -------------------------------------------------------------------------
  // Scenario 1b — app/icon.png is a valid PNG
  // Given: app/icon.png exists
  // When:  we read the first 8 bytes
  // Then:  they must match the PNG magic signature
  // -------------------------------------------------------------------------
  it("Scenario 1 — app/icon.png is a valid PNG file (magic bytes)", () => {
    expect(isPng(iconPath)).toBe(true)
  })

  // -------------------------------------------------------------------------
  // Scenario 2 — No distortion: icon must be square 512×512
  // Given: source logo is 940×734 (non-square)
  // When:  the favicon is generated (center-crop → resize)
  // Then:  width === height === 512
  // -------------------------------------------------------------------------
  it("Scenario 2 — app/icon.png is 512 pixels wide", () => {
    const { width } = readPngDimensions(iconPath)
    expect(width).toBe(512)
  })

  it("Scenario 2 — app/icon.png is 512 pixels tall", () => {
    const { height } = readPngDimensions(iconPath)
    expect(height).toBe(512)
  })

  it("Scenario 2 — app/icon.png is square (width === height, no distortion)", () => {
    const { width, height } = readPngDimensions(iconPath)
    expect(width).toBe(height)
  })

  // -------------------------------------------------------------------------
  // Bonus — RGBA colour type preserved from source logo
  // PNG colour type 6 = RGBA (matches the source logo-transparent.png)
  // This ensures the transparency of the house logo is kept.
  // -------------------------------------------------------------------------
  it("app/icon.png has an alpha channel (colour type 6 = RGBA)", () => {
    const { colourType } = readPngDimensions(iconPath)
    // colour type 6 = RGBA, colour type 2 = RGB (no alpha)
    expect(colourType).toBe(6)
  })

})
