import type { SignaturePlacement } from "./pdf-signing";

export const signatureBlockAspectRatio = 0.43;
export const minSignatureWidthRatio = 0.16;
export const maxSignatureWidthRatio = 0.48;
export const defaultSignatureWidthRatio = 0.28;

export function clampSignaturePlacement(placement: SignaturePlacement): SignaturePlacement {
  const widthRatio = Math.min(Math.max(placement.widthRatio, minSignatureWidthRatio), maxSignatureWidthRatio);
  const heightRatio = Math.min(Math.max(placement.heightRatio, widthRatio * signatureBlockAspectRatio), 0.32);
  const xRatio = Math.min(Math.max(placement.xRatio, 0), 1 - widthRatio);
  const yRatio = Math.min(Math.max(placement.yRatio, 0), 1 - heightRatio);

  return {
    pageNumber: Math.max(1, Math.round(placement.pageNumber)),
    xRatio,
    yRatio,
    widthRatio,
    heightRatio
  };
}

export function centeredPlacementFromPoint(input: {
  pageNumber: number;
  xRatio: number;
  yRatio: number;
  widthRatio?: number;
}) {
  const widthRatio = input.widthRatio ?? defaultSignatureWidthRatio;
  const heightRatio = widthRatio * signatureBlockAspectRatio;

  return clampSignaturePlacement({
    pageNumber: input.pageNumber,
    xRatio: input.xRatio - widthRatio / 2,
    yRatio: input.yRatio - heightRatio / 2,
    widthRatio,
    heightRatio
  });
}

export function presetSignaturePlacement(pageNumber: number, preset: "bottom_left" | "bottom_center" | "bottom_right") {
  const widthRatio = defaultSignatureWidthRatio;
  const heightRatio = widthRatio * signatureBlockAspectRatio;
  const xRatio = preset === "bottom_left" ? 0.08 : preset === "bottom_center" ? 0.36 : 0.64;

  return clampSignaturePlacement({
    pageNumber,
    xRatio,
    yRatio: 0.78,
    widthRatio,
    heightRatio
  });
}

export function moveSignaturePlacement(placement: SignaturePlacement, deltaXRatio: number, deltaYRatio: number) {
  return clampSignaturePlacement({
    ...placement,
    xRatio: placement.xRatio + deltaXRatio,
    yRatio: placement.yRatio + deltaYRatio
  });
}

export function resizeSignaturePlacement(placement: SignaturePlacement, deltaWidthRatio: number) {
  const widthRatio = placement.widthRatio + deltaWidthRatio;

  return clampSignaturePlacement({
    ...placement,
    widthRatio,
    heightRatio: widthRatio * signatureBlockAspectRatio
  });
}
