import { describe, expect, it } from "vitest";
import {
  centeredPlacementFromPoint,
  clampSignaturePlacement,
  maxSignatureWidthRatio,
  minSignatureWidthRatio,
  moveSignaturePlacement,
  presetSignaturePlacement,
  resizeSignaturePlacement,
  signatureBlockAspectRatio
} from "./signature-placement";

describe("signature placement UI rules", () => {
  it("keeps dropped signatures inside page bounds", () => {
    const placement = centeredPlacementFromPoint({ pageNumber: 1, xRatio: 0.99, yRatio: 0.99 });

    expect(placement.xRatio + placement.widthRatio).toBeLessThanOrEqual(1);
    expect(placement.yRatio + placement.heightRatio).toBeLessThanOrEqual(1);
  });

  it("clamps excessively small and large signatures", () => {
    expect(clampSignaturePlacement({ pageNumber: 1, xRatio: 0, yRatio: 0, widthRatio: 0.01, heightRatio: 0.01 }).widthRatio).toBe(minSignatureWidthRatio);
    expect(clampSignaturePlacement({ pageNumber: 1, xRatio: 0, yRatio: 0, widthRatio: 0.9, heightRatio: 0.9 }).widthRatio).toBe(maxSignatureWidthRatio);
  });

  it("provides bottom placement presets without exposing raw coordinates to users", () => {
    expect(presetSignaturePlacement(2, "bottom_left").pageNumber).toBe(2);
    expect(presetSignaturePlacement(2, "bottom_center").xRatio).toBeGreaterThan(presetSignaturePlacement(2, "bottom_left").xRatio);
    expect(presetSignaturePlacement(2, "bottom_right").xRatio).toBeGreaterThan(presetSignaturePlacement(2, "bottom_center").xRatio);
  });

  it("moves placement while preserving bounds", () => {
    const placement = moveSignaturePlacement(presetSignaturePlacement(1, "bottom_right"), 1, 1);

    expect(placement.xRatio + placement.widthRatio).toBeLessThanOrEqual(1);
    expect(placement.yRatio + placement.heightRatio).toBeLessThanOrEqual(1);
  });

  it("resizes with a consistent aspect ratio", () => {
    const placement = resizeSignaturePlacement(presetSignaturePlacement(1, "bottom_left"), 0.05);

    expect(placement.heightRatio / placement.widthRatio).toBeCloseTo(signatureBlockAspectRatio);
  });
});
