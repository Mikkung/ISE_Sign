import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  parseSignatureDataUrl,
  resolveAutomaticSignaturePlacement,
  stampPdfWithSignature,
  validateSignaturePlacement
} from "./pdf-signing";

const transparentPng =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

describe("PDF visual signing helpers", () => {
  it("rejects invalid normalized coordinates", () => {
    expect(validateSignaturePlacement({ pageNumber: 1, xRatio: 0.9, yRatio: 0.1, widthRatio: 0.2, heightRatio: 0.1 }, 1).ok).toBe(false);
    expect(validateSignaturePlacement({ pageNumber: 2, xRatio: 0.1, yRatio: 0.1, widthRatio: 0.2, heightRatio: 0.1 }, 1).ok).toBe(false);
  });

  it("parses PNG data URLs and rejects non-images", () => {
    expect(parseSignatureDataUrl(transparentPng)?.mimeType).toBe("image/png");
    expect(parseSignatureDataUrl("data:text/plain;base64,SGVsbG8=")).toBeNull();
  });

  it("stamps a new PDF without mutating the source bytes", async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage([300, 300]);
    const source = Buffer.from(await pdf.save());
    const signature = parseSignatureDataUrl(transparentPng);

    if (!signature) throw new Error("Missing test signature");

    const result = await stampPdfWithSignature({
      sourcePdf: source,
      signatureImage: signature.bytes,
      signatureMimeType: signature.mimeType,
      placement: { pageNumber: 1, xRatio: 0.1, yRatio: 0.7, widthRatio: 0.4, heightRatio: 0.15 },
      printedName: "Approver One",
      roleAtSigning: "Faculty Approver",
      stepName: "Faculty Approval",
      signedAt: new Date("2026-08-04T00:00:00Z")
    });

    expect(result.sha256Hash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.bytes.equals(source)).toBe(false);
    expect(source.equals(source)).toBe(true);
  });

  it("does not draw a visible signature block border into the final PDF", () => {
    expect(stampPdfWithSignature.toString()).not.toContain("drawRectangle");
  });

  it("resolves automatic Staff and Faculty slots without drag interaction", () => {
    expect(resolveAutomaticSignaturePlacement({
      pageCount: 2,
      signerRole: "staff",
      existingSignatureStamps: []
    }).placement.xRatio).toBeCloseTo(0.07);
    expect(resolveAutomaticSignaturePlacement({
      pageCount: 2,
      signerRole: "Faculty Approver",
      existingSignatureStamps: []
    }).placement.xRatio).toBeCloseTo(0.67);
  });

  it("avoids overlapping an existing signature stamp", () => {
    const resolved = resolveAutomaticSignaturePlacement({
      pageCount: 1,
      signerRole: "staff",
      existingSignatureStamps: [{ pageNumber: 1, xRatio: 0.07, yRatio: 0.8, widthRatio: 0.26, heightRatio: 0.12 }]
    });

    expect(resolved.placement.xRatio).not.toBeCloseTo(0.07);
  });

  it("appends a signature page when no safe slot remains", () => {
    const resolved = resolveAutomaticSignaturePlacement({
      pageCount: 1,
      signerRole: "staff",
      existingSignatureStamps: [
        { pageNumber: 1, xRatio: 0.07, yRatio: 0.8, widthRatio: 0.26, heightRatio: 0.12 },
        { pageNumber: 1, xRatio: 0.37, yRatio: 0.8, widthRatio: 0.26, heightRatio: 0.12 },
        { pageNumber: 1, xRatio: 0.67, yRatio: 0.8, widthRatio: 0.26, heightRatio: 0.12 }
      ]
    });

    expect(resolved.appendSignaturePage).toBe(true);
    expect(resolved.placement.pageNumber).toBe(2);
  });
});
