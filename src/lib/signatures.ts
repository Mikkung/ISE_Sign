import { z } from "zod";
import { parseSignatureDataUrl, validateSignaturePlacement } from "./pdf-signing";

export const signatureMethodSchema = z.enum(["drawn", "typed", "uploaded"]);

export const signaturePlacementSchema = z.object({
  pageNumber: z.coerce.number().int().min(1),
  xRatio: z.coerce.number(),
  yRatio: z.coerce.number(),
  widthRatio: z.coerce.number(),
  heightRatio: z.coerce.number()
});

export const visualApprovalSchema = z.object({
  sourceDocumentVersionId: z.string().uuid(),
  signatureMethod: signatureMethodSchema,
  signatureDataUrl: z.string().min(1),
  placementPreset: z.enum([
    "automatic",
    "last_page_bottom_left",
    "last_page_bottom_center",
    "last_page_bottom_right",
    "signature_page",
    "advanced"
  ]).default("automatic"),
  pageNumber: z.coerce.number().int().min(1).optional(),
  xRatio: z.coerce.number().optional(),
  yRatio: z.coerce.number().optional(),
  widthRatio: z.coerce.number().optional(),
  heightRatio: z.coerce.number().optional(),
  saveSignature: z.enum(["on"]).optional(),
  visualSignatureConsent: z.enum(["on"])
});

export function parseVisualApprovalForm(formData: FormData) {
  const parsed = visualApprovalSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return { ok: false as const, message: parsed.error.issues[0]?.message ?? "Check the signature placement details." };
  }

  const placement = parsed.data.placementPreset === "advanced"
    ? {
        pageNumber: parsed.data.pageNumber ?? 1,
        xRatio: parsed.data.xRatio ?? 0,
        yRatio: parsed.data.yRatio ?? 0,
        widthRatio: parsed.data.widthRatio ?? 0,
        heightRatio: parsed.data.heightRatio ?? 0
      }
    : null;
  const placementResult = placement ? validateSignaturePlacement(placement, 9999) : { ok: true as const };

  if (!placementResult.ok) {
    return placementResult;
  }

  const signature = parseSignatureDataUrl(parsed.data.signatureDataUrl);

  if (!signature) {
    return { ok: false as const, message: "Signature image must be a PNG or JPEG up to 1 MB." };
  }

  return {
    ok: true as const,
    sourceDocumentVersionId: parsed.data.sourceDocumentVersionId,
    method: parsed.data.signatureMethod,
    signature,
    placement,
    placementPreset: parsed.data.placementPreset,
    saveSignature: parsed.data.saveSignature === "on"
  };
}

export function signatureStoragePath(userId: string, extension: "png" | "jpg", id: string) {
  return `${userId}/${id}.${extension}`;
}
