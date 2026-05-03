import { describe, expect, it } from "vitest";
import { verifyMagicBytes } from "@/lib/uploads";

describe("verifyMagicBytes", () => {
  it("valid PDF signature", () => {
    const buf = new Uint8Array([
      0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x0a, 0x0a, 0x0a,
    ]);
    expect(verifyMagicBytes(buf, "application/pdf")).toBe(true);
  });

  it("valid JPEG signature", () => {
    const buf = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(verifyMagicBytes(buf, "image/jpeg")).toBe(true);
  });

  it("valid PNG signature", () => {
    const buf = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
    ]);
    expect(verifyMagicBytes(buf, "image/png")).toBe(true);
  });

  it("valid WEBP signature", () => {
    const buf = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
    ]);
    expect(verifyMagicBytes(buf, "image/webp")).toBe(true);
  });

  it("rejects EXE disguised as PDF", () => {
    // "MZ" = DOS executable header
    const buf = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(verifyMagicBytes(buf, "application/pdf")).toBe(false);
  });

  it("rejects PDF disguised as JPEG", () => {
    const buf = new Uint8Array([
      0x25, 0x50, 0x44, 0x46, 0x2d, 0, 0, 0, 0, 0, 0, 0,
    ]);
    expect(verifyMagicBytes(buf, "image/jpeg")).toBe(false);
  });

  it("rejects zip (possible disguised malware)", () => {
    // "PK" = ZIP
    const buf = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(verifyMagicBytes(buf, "application/pdf")).toBe(false);
    expect(verifyMagicBytes(buf, "image/png")).toBe(false);
  });

  it("rejects empty buffer", () => {
    const buf = new Uint8Array([]);
    expect(verifyMagicBytes(buf, "application/pdf")).toBe(false);
  });

  it("rejects short buffer", () => {
    const buf = new Uint8Array([0x25, 0x50]);
    expect(verifyMagicBytes(buf, "application/pdf")).toBe(false);
  });

  it("rejects unknown MIME type", () => {
    const buf = new Uint8Array([
      0x25, 0x50, 0x44, 0x46, 0x2d, 0, 0, 0, 0, 0, 0, 0,
    ]);
    expect(verifyMagicBytes(buf, "application/octet-stream")).toBe(false);
  });

  it("rejects WEBP with wrong container tag", () => {
    // RIFF but not WEBP (could be WAV, AVI)
    const buf = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45,
    ]);
    expect(verifyMagicBytes(buf, "image/webp")).toBe(false);
  });
});
