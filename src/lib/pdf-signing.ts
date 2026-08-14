import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { createDocumentHash } from "./certificates";

export interface SignaturePlacement {
  pageNumber: number;
  xRatio: number;
  yRatio: number;
  widthRatio: number;
  heightRatio: number;
}

export interface PdfSignatureStampInput {
  sourcePdf: Buffer;
  signatureImage: Buffer;
  signatureMimeType: "image/png" | "image/jpeg";
  placement: SignaturePlacement;
  printedName: string;
  roleAtSigning: string;
  stepName: string;
  signedAt: Date;
  projectCode?: string;
  projectTitle?: string;
  appendSignaturePage?: boolean;
}

export interface PdfSignatureStampResult {
  bytes: Buffer;
  sha256Hash: string;
  pageCount: number;
  stampedPageNumber: number;
}

export interface ExistingSignatureStampBox {
  pageNumber: number;
  xRatio: number;
  yRatio: number;
  widthRatio: number;
  heightRatio: number;
}

export type SignaturePlacementPreset =
  | "automatic"
  | "last_page_bottom_left"
  | "last_page_bottom_center"
  | "last_page_bottom_right"
  | "signature_page"
  | "advanced";

function overlaps(a: SignaturePlacement, b: ExistingSignatureStampBox) {
  if (a.pageNumber !== b.pageNumber) {
    return false;
  }

  return !(
    a.xRatio + a.widthRatio <= b.xRatio ||
    b.xRatio + b.widthRatio <= a.xRatio ||
    a.yRatio + a.heightRatio <= b.yRatio ||
    b.yRatio + b.heightRatio <= a.yRatio
  );
}

export function resolveAutomaticSignaturePlacement(input: {
  pageCount: number;
  signerRole: string;
  existingSignatureStamps: ExistingSignatureStampBox[];
  preset?: SignaturePlacementPreset;
  advancedPlacement?: SignaturePlacement | null;
}) {
  const pageNumber = input.pageCount;
  const staffPreferred = input.signerRole.toLowerCase().includes("staff");
  const slots: SignaturePlacement[] = [
    { pageNumber, xRatio: 0.07, yRatio: 0.8, widthRatio: 0.26, heightRatio: 0.12 },
    { pageNumber, xRatio: 0.37, yRatio: 0.8, widthRatio: 0.26, heightRatio: 0.12 },
    { pageNumber, xRatio: 0.67, yRatio: 0.8, widthRatio: 0.26, heightRatio: 0.12 }
  ];
  const orderedSlots = staffPreferred ? slots : [slots[2], slots[1], slots[0]];
  const presetMap: Record<Exclude<SignaturePlacementPreset, "automatic" | "advanced" | "signature_page">, SignaturePlacement> = {
    last_page_bottom_left: slots[0],
    last_page_bottom_center: slots[1],
    last_page_bottom_right: slots[2]
  };

  if (input.preset === "advanced" && input.advancedPlacement) {
    return { placement: input.advancedPlacement, appendSignaturePage: false };
  }

  if (input.preset && input.preset in presetMap) {
    const placement = presetMap[input.preset as keyof typeof presetMap];
    if (!input.existingSignatureStamps.some((stamp) => overlaps(placement, stamp))) {
      return { placement, appendSignaturePage: false };
    }
  }

  if (input.preset !== "signature_page") {
    const openSlot = orderedSlots.find((slot) => !input.existingSignatureStamps.some((stamp) => overlaps(slot, stamp)));
    if (openSlot) {
      return { placement: openSlot, appendSignaturePage: false };
    }
  }

  return {
    placement: { pageNumber: input.pageCount + 1, xRatio: 0.18, yRatio: 0.36, widthRatio: 0.64, heightRatio: 0.22 },
    appendSignaturePage: true
  };
}

export function validateSignaturePlacement(placement: SignaturePlacement, pageCount: number) {
  const values = [
    placement.pageNumber,
    placement.xRatio,
    placement.yRatio,
    placement.widthRatio,
    placement.heightRatio
  ];

  if (!values.every(Number.isFinite)) {
    return { ok: false as const, message: "Signature placement contains invalid numbers." };
  }

  if (!Number.isInteger(placement.pageNumber) || placement.pageNumber < 1 || placement.pageNumber > pageCount) {
    return { ok: false as const, message: "Signature placement page is invalid." };
  }

  if (
    placement.xRatio < 0 ||
    placement.yRatio < 0 ||
    placement.widthRatio <= 0 ||
    placement.heightRatio <= 0 ||
    placement.xRatio + placement.widthRatio > 1 ||
    placement.yRatio + placement.heightRatio > 1
  ) {
    return { ok: false as const, message: "Signature placement must stay inside the page." };
  }

  return { ok: true as const };
}

export function parseSignatureDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:(image\/png|image\/jpeg);base64,([A-Za-z0-9+/=]+)$/);

  if (!match) {
    return null;
  }

  const mimeType = match[1] as "image/png" | "image/jpeg";
  const bytes = Buffer.from(match[2], "base64");

  if (bytes.length <= 0 || bytes.length > 1024 * 1024) {
    return null;
  }

  return { mimeType, bytes };
}

export async function getPdfPageCount(sourcePdf: Buffer) {
  const pdf = await PDFDocument.load(sourcePdf);
  return pdf.getPageCount();
}

export async function stampPdfWithSignature(input: PdfSignatureStampInput): Promise<PdfSignatureStampResult> {
  const pdf = await PDFDocument.load(input.sourcePdf);
  if (input.appendSignaturePage) {
    const page = pdf.addPage([595.28, 841.89]);
    const titleFont = await pdf.embedFont(StandardFonts.HelveticaBold);
    const textFont = await pdf.embedFont(StandardFonts.Helvetica);
    page.drawText("Approval Signatures", { x: 64, y: 770, size: 18, font: titleFont, color: rgb(0.08, 0.1, 0.15) });
    page.drawText(input.projectCode ? `Project Code: ${input.projectCode}` : "Project Code: -", { x: 64, y: 735, size: 10, font: textFont, color: rgb(0.25, 0.29, 0.36) });
    page.drawText(input.projectTitle ? `Project Title: ${input.projectTitle}` : "Project Title: -", { x: 64, y: 716, size: 10, font: textFont, color: rgb(0.25, 0.29, 0.36), maxWidth: 460 });
  }

  const pages = pdf.getPages();
  const placementResult = validateSignaturePlacement(input.placement, pages.length);

  if (!placementResult.ok) {
    throw new Error(placementResult.message);
  }

  const page = pages[input.placement.pageNumber - 1];
  const { width, height } = page.getSize();
  const signature = input.signatureMimeType === "image/png"
    ? await pdf.embedPng(input.signatureImage)
    : await pdf.embedJpg(input.signatureImage);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const boxX = input.placement.xRatio * width;
  const boxY = height - (input.placement.yRatio + input.placement.heightRatio) * height;
  const boxWidth = input.placement.widthRatio * width;
  const boxHeight = input.placement.heightRatio * height;
  const imageHeight = Math.max(boxHeight * 0.52, 18);
  const textStartY = boxY + Math.max(4, boxHeight * 0.14);
  const signedAtLabel = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok"
  }).format(input.signedAt);

  page.drawRectangle({
    x: boxX,
    y: boxY,
    width: boxWidth,
    height: boxHeight,
    borderColor: rgb(0.55, 0.14, 0.2),
    borderWidth: 0.8,
    color: rgb(1, 1, 1),
    opacity: 0.92
  });
  page.drawImage(signature, {
    x: boxX + 8,
    y: boxY + boxHeight - imageHeight - 6,
    width: Math.max(boxWidth - 16, 1),
    height: imageHeight
  });
  page.drawText(input.printedName, {
    x: boxX + 8,
    y: textStartY + 24,
    size: 9,
    font: boldFont,
    color: rgb(0.08, 0.1, 0.15),
    maxWidth: boxWidth - 16
  });
  page.drawText(`${input.roleAtSigning} · ${input.stepName}`, {
    x: boxX + 8,
    y: textStartY + 12,
    size: 7,
    font,
    color: rgb(0.25, 0.29, 0.36),
    maxWidth: boxWidth - 16
  });
  page.drawText(`Signed ${signedAtLabel} ICT`, {
    x: boxX + 8,
    y: textStartY,
    size: 7,
    font,
    color: rgb(0.25, 0.29, 0.36),
    maxWidth: boxWidth - 16
  });

  const bytes = Buffer.from(await pdf.save());
  return {
    bytes,
    sha256Hash: createDocumentHash(bytes),
    pageCount: pages.length,
    stampedPageNumber: input.placement.pageNumber
  };
}
