"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useRef, useState } from "react";
import { SignatureCanvas } from "@/components/signing/signature-canvas";
import { SecondaryDecisionButton, SignatureSubmitButton } from "@/components/signing/signature-consent";
import type { SignaturePlacement } from "@/lib/pdf-signing";
import {
  centeredPlacementFromPoint,
  moveSignaturePlacement,
  presetSignaturePlacement,
  resizeSignaturePlacement
} from "@/lib/signature-placement";

type SignatureMethod = "drawn" | "typed" | "uploaded";
type DragMode =
  | { type: "source" }
  | { type: "move"; startX: number; startY: number; startPlacement: SignaturePlacement }
  | { type: "resize"; startX: number; startPlacement: SignaturePlacement }
  | null;

interface PdfSignatureEditorProps {
  action: (formData: FormData) => void;
  documentVersionId: string;
  documentVersionNumber: number;
  documentHash: string;
  documentFileName: string;
  documentUrl: string;
  pageCount: number;
  approverName: string;
  approverRole: string;
  stepName: string;
  savedSignatureDataUrl?: string | null;
}

function typedSignatureDataUrl(name: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 220;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#111827";
  ctx.font = "italic 58px Georgia, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(name || "Signature", canvas.width / 2, canvas.height / 2, canvas.width - 40);
  return canvas.toDataURL("image/png");
}

function ratioPointFromEvent(event: PointerEvent | React.PointerEvent, rect: DOMRect) {
  return {
    xRatio: (event.clientX - rect.left) / rect.width,
    yRatio: (event.clientY - rect.top) / rect.height
  };
}

export function PdfSignatureEditor({
  action,
  documentVersionId,
  documentVersionNumber,
  documentHash,
  documentFileName,
  documentUrl,
  pageCount,
  approverName,
  approverRole,
  stepName,
  savedSignatureDataUrl
}: PdfSignatureEditorProps) {
  const pageRef = useRef<HTMLDivElement>(null);
  const [method, setMethod] = useState<SignatureMethod>(savedSignatureDataUrl ? "uploaded" : "drawn");
  const [signatureDataUrl, setSignatureDataUrl] = useState(savedSignatureDataUrl ?? "");
  const [typedName, setTypedName] = useState(approverName);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [fitWidth, setFitWidth] = useState(true);
  const [placement, setPlacement] = useState<SignaturePlacement | null>(null);
  const [dragMode, setDragMode] = useState<DragMode>(null);
  const [tapToPlace, setTapToPlace] = useState(false);
  const [message, setMessage] = useState("Drag this signature block onto the document.");
  const [consent, setConsent] = useState(false);
  const previewUrl = useMemo(() => `${documentUrl}#page=${currentPage}&zoom=${zoom}`, [documentUrl, currentPage, zoom]);
  const placementOnCurrentPage = placement?.pageNumber === currentPage ? placement : null;
  const canApprove = Boolean(signatureDataUrl && placement && consent);

  useEffect(() => {
    if (!dragMode) return;
    const activeDrag = dragMode;

    function onPointerMove(event: PointerEvent) {
      const rect = pageRef.current?.getBoundingClientRect();
      if (!rect) return;

      if (activeDrag.type === "move") {
        const dx = (event.clientX - activeDrag.startX) / rect.width;
        const dy = (event.clientY - activeDrag.startY) / rect.height;
        setPlacement(moveSignaturePlacement(activeDrag.startPlacement, dx, dy));
        return;
      }

      if (activeDrag.type === "resize") {
        const dx = (event.clientX - activeDrag.startX) / rect.width;
        setPlacement(resizeSignaturePlacement(activeDrag.startPlacement, dx));
      }
    }

    function onPointerUp(event: PointerEvent) {
      const rect = pageRef.current?.getBoundingClientRect();
      if (activeDrag.type === "source" && rect && signatureDataUrl) {
        const inside =
          event.clientX >= rect.left &&
          event.clientX <= rect.right &&
          event.clientY >= rect.top &&
          event.clientY <= rect.bottom;

        if (inside) {
          const point = ratioPointFromEvent(event, rect);
          const nextPlacement = centeredPlacementFromPoint({
            pageNumber: currentPage,
            xRatio: point.xRatio,
            yRatio: point.yRatio
          });
          setPlacement(nextPlacement);
          setMessage(`Signature placed on Page ${currentPage}.`);
          pageRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
        } else {
          setMessage("Drop the signature inside the visible PDF page.");
        }
      } else if (activeDrag.type === "move" || activeDrag.type === "resize") {
        setMessage(`Signature placement updated on Page ${placement?.pageNumber ?? currentPage}.`);
      }
      setDragMode(null);
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [currentPage, dragMode, placement?.pageNumber, signatureDataUrl]);

  function applyTypedName(value: string) {
    setTypedName(value);
    setSignatureDataUrl(typedSignatureDataUrl(value));
  }

  function uploadSignature(file: File | undefined) {
    if (!file) return;
    if (!["image/png", "image/jpeg"].includes(file.type) || file.size > 1024 * 1024) {
      setSignatureDataUrl("");
      setMessage("Signature image must be PNG or JPEG up to 1 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setSignatureDataUrl(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  }

  function placeAtPreset(preset: "bottom_left" | "bottom_center" | "bottom_right") {
    const nextPlacement = presetSignaturePlacement(currentPage, preset);
    setPlacement(nextPlacement);
    setMessage(`Signature placed on Page ${currentPage}.`);
  }

  function placeOnSignaturePage() {
    const nextPage = pageCount + 1;
    setCurrentPage(pageCount);
    setPlacement({ pageNumber: nextPage, xRatio: 0.18, yRatio: 0.36, widthRatio: 0.64, heightRatio: 0.22 });
    setMessage("A signature page will be appended during server-side signing.");
  }

  function moveByKeyboard(deltaX: number, deltaY: number) {
    if (!placement) return;
    const nextPlacement = moveSignaturePlacement(placement, deltaX, deltaY);
    setPlacement(nextPlacement);
    setCurrentPage(nextPlacement.pageNumber);
    setMessage(`Signature placement updated on Page ${nextPlacement.pageNumber}.`);
  }

  function resizeByKeyboard(deltaWidth: number) {
    if (!placement) return;
    setPlacement(resizeSignaturePlacement(placement, deltaWidth));
    setMessage("Signature size updated.");
  }

  function handlePageClick(event: React.PointerEvent<HTMLDivElement>) {
    if (!tapToPlace || !signatureDataUrl) return;
    const rect = pageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const point = ratioPointFromEvent(event, rect);
    const nextPlacement = centeredPlacementFromPoint({
      pageNumber: currentPage,
      xRatio: point.xRatio,
      yRatio: point.yRatio
    });
    setPlacement(nextPlacement);
    setTapToPlace(false);
    setMessage(`Signature placed on Page ${currentPage}.`);
  }

  function onPlacementKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!placement) return;
    const step = event.shiftKey ? 0.04 : 0.01;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveByKeyboard(-step, 0);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      moveByKeyboard(step, 0);
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveByKeyboard(0, -step);
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveByKeyboard(0, step);
    }
  }

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="sourceDocumentVersionId" value={documentVersionId} />
      <input type="hidden" name="signatureMethod" value={method} />
      <input type="hidden" name="signatureDataUrl" value={signatureDataUrl} />
      <input type="hidden" name="placementPreset" value={placement && placement.pageNumber > pageCount ? "signature_page" : placement ? "advanced" : "automatic"} />
      <input type="hidden" name="pageNumber" value={placement?.pageNumber ?? currentPage} />
      <input type="hidden" name="xRatio" value={placement?.xRatio ?? 0} />
      <input type="hidden" name="yRatio" value={placement?.yRatio ?? 0} />
      <input type="hidden" name="widthRatio" value={placement?.widthRatio ?? 0} />
      <input type="hidden" name="heightRatio" value={placement?.heightRatio ?? 0} />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded border border-slate-200 bg-slate-50 p-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-slate-900">{documentFileName}</p>
              <p className="text-xs text-slate-500">Version v{documentVersionNumber} · SHA-256 {documentHash}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setCurrentPage((value) => Math.max(1, value - 1))} className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-semibold">
                Previous Page
              </button>
              <span className="text-sm font-medium text-slate-700">Page {currentPage} / {pageCount}</span>
              <button type="button" onClick={() => setCurrentPage((value) => Math.min(pageCount, value + 1))} className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-semibold">
                Next Page
              </button>
              <button type="button" onClick={() => { setFitWidth(false); setZoom((value) => Math.max(60, value - 10)); }} className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-semibold">Zoom Out</button>
              <button type="button" onClick={() => { setFitWidth(false); setZoom((value) => Math.min(180, value + 10)); }} className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-semibold">Zoom In</button>
              <button type="button" onClick={() => setFitWidth(true)} className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-semibold">Fit Width</button>
              <button type="button" onClick={() => { setZoom(100); setFitWidth(true); }} className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-semibold">Reset Zoom</button>
            </div>
          </div>
          <p className={`mb-2 rounded px-3 py-2 text-sm ${dragMode?.type === "source" || tapToPlace ? "border border-ise-maroon bg-red-50 text-ise-maroon" : "border border-slate-200 bg-white text-slate-600"}`}>
            {message}
          </p>
          <div className="overflow-auto rounded border border-slate-300 bg-slate-200 p-4">
            <div
              ref={pageRef}
              onPointerDown={handlePageClick}
              className={`relative mx-auto aspect-[0.707/1] bg-white shadow-lg ${fitWidth ? "w-full max-w-[860px]" : ""}`}
              style={fitWidth ? undefined : { width: `${Math.max(620, zoom * 7)}px` }}
              aria-label={`PDF page ${currentPage} drop zone`}
            >
              <iframe
                title="PDF document preview"
                src={previewUrl}
                className="absolute inset-0 h-full w-full border-0 bg-white"
              />
              <div className={`absolute inset-0 ${dragMode?.type === "source" || tapToPlace ? "bg-ise-maroon/5 ring-2 ring-ise-maroon" : ""}`} />
              {placementOnCurrentPage ? (
                <div
                  role="group"
                  tabIndex={0}
                  aria-label={`Editable signature placement on page ${currentPage}`}
                  onKeyDown={onPlacementKeyDown}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    setDragMode({
                      type: "move",
                      startX: event.clientX,
                      startY: event.clientY,
                      startPlacement: placementOnCurrentPage
                    });
                  }}
                  className="absolute cursor-move rounded border-2 border-ise-maroon bg-white/95 p-2 shadow-xl focus:outline-none focus:ring-2 focus:ring-ise-maroon"
                  style={{
                    left: `${placementOnCurrentPage.xRatio * 100}%`,
                    top: `${placementOnCurrentPage.yRatio * 100}%`,
                    width: `${placementOnCurrentPage.widthRatio * 100}%`,
                    height: `${placementOnCurrentPage.heightRatio * 100}%`
                  }}
                >
                  <div className="flex h-full flex-col items-center justify-center overflow-hidden text-center text-[10px] text-slate-700">
                    <img src={signatureDataUrl} alt="" className="max-h-[45%] w-full object-contain" />
                    <span className="font-semibold text-slate-950">{approverName}</span>
                    <span>{approverRole}</span>
                    <span>{stepName}</span>
                    <span>Signed timestamp from server</span>
                  </div>
                  <button
                    type="button"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => {
                      setPlacement(null);
                      setMessage("Signature removed. Drag it onto the document again.");
                    }}
                    className="absolute -right-2 -top-2 rounded-full bg-red-700 px-2 py-0.5 text-xs font-semibold text-white"
                    aria-label="Remove signature placement"
                  >
                    ×
                  </button>
                  <span className="absolute left-1 top-1 rounded bg-ise-maroon px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    Page {currentPage}
                  </span>
                  <button
                    type="button"
                    aria-label="Resize signature"
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setDragMode({ type: "resize", startX: event.clientX, startPlacement: placementOnCurrentPage });
                    }}
                    className="absolute -bottom-2 -right-2 h-5 w-5 rounded-full border border-ise-maroon bg-white"
                  />
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <section className="rounded border border-slate-200 bg-white p-4">
            <h3 className="font-semibold text-slate-950">Approver</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div><dt className="text-slate-500">Name</dt><dd className="font-medium text-slate-900">{approverName}</dd></div>
              <div><dt className="text-slate-500">Role</dt><dd className="font-medium text-slate-900">{approverRole}</dd></div>
              <div><dt className="text-slate-500">Step</dt><dd className="font-medium text-slate-900">{stepName}</dd></div>
              <div><dt className="text-slate-500">Document</dt><dd className="font-medium text-slate-900">v{documentVersionNumber}</dd></div>
              <div><dt className="text-slate-500">SHA-256</dt><dd className="break-all font-mono text-xs text-slate-700">{documentHash}</dd></div>
            </dl>
          </section>

          <section className="rounded border border-slate-200 bg-white p-4">
            <h3 className="font-semibold text-slate-950">Create Your Signature</h3>
            {savedSignatureDataUrl ? <p className="mt-2 rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-800">Your saved default signature is ready.</p> : null}
            <div className="mt-3 grid grid-cols-3 gap-2">
              {(["drawn", "typed", "uploaded"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setMethod(item)}
                  className={`rounded border px-3 py-2 text-sm font-semibold ${method === item ? "border-ise-maroon bg-red-50 text-ise-maroon" : "border-slate-300 text-slate-700"}`}
                >
                  {item === "drawn" ? "Draw" : item === "typed" ? "Type" : "Upload"}
                </button>
              ))}
            </div>
            <div className="mt-3">
              {method === "drawn" ? <SignatureCanvas onChange={setSignatureDataUrl} /> : null}
              {method === "typed" ? (
                <label className="space-y-2 text-sm">
                  <span className="font-medium text-slate-700">Typed signature name</span>
                  <input value={typedName} onChange={(event) => applyTypedName(event.target.value)} className="w-full rounded border border-slate-300 px-3 py-2" />
                </label>
              ) : null}
              {method === "uploaded" ? (
                <label className="space-y-2 text-sm">
                  <span className="font-medium text-slate-700">Upload PNG or JPEG signature</span>
                  <input type="file" accept="image/png,image/jpeg" onChange={(event) => uploadSignature(event.target.files?.[0])} className="w-full rounded border border-slate-300 px-3 py-2" />
                </label>
              ) : null}
            </div>
          </section>

          <section className="rounded border border-slate-200 bg-white p-4">
            <h3 className="font-semibold text-slate-950">Signature Preview</h3>
            {signatureDataUrl ? (
              <div
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    placeAtPreset("bottom_right");
                  }
                }}
                onPointerDown={(event) => {
                  event.preventDefault();
                  setDragMode({ type: "source" });
                  setMessage("Drop the signature onto the highlighted PDF page.");
                }}
                className="mt-3 cursor-grab rounded border-2 border-dashed border-ise-maroon bg-red-50 p-3 text-center active:cursor-grabbing"
              >
                <p className="text-sm font-semibold text-ise-maroon">Drag Signature to PDF</p>
                <img src={signatureDataUrl} alt="Signature preview" className="mt-2 max-h-20 w-full object-contain" />
                <p className="mt-2 text-sm font-semibold text-slate-950">{approverName}</p>
                <p className="text-xs text-slate-600">{approverRole} · {stepName}</p>
                <p className="text-xs text-slate-500">Server timestamp on final approval</p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">Create or upload a signature before dragging.</p>
            )}
            <button
              type="button"
              disabled={!signatureDataUrl}
              onClick={() => {
                setTapToPlace(true);
                setMessage("Tap a location on the PDF page to place your signature.");
              }}
              className="mt-3 w-full rounded border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50"
            >
              Tap to Place
            </button>
            <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
              <input name="saveSignature" type="checkbox" />
              Save as My Signature
            </label>
          </section>

          <section className="rounded border border-slate-200 bg-white p-4">
            <h3 className="font-semibold text-slate-950">Placement Presets</h3>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" disabled={!signatureDataUrl} onClick={() => placeAtPreset("bottom_left")} className="rounded border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50">Bottom Left</button>
              <button type="button" disabled={!signatureDataUrl} onClick={() => placeAtPreset("bottom_center")} className="rounded border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50">Bottom Center</button>
              <button type="button" disabled={!signatureDataUrl} onClick={() => placeAtPreset("bottom_right")} className="rounded border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50">Bottom Right</button>
              <button type="button" disabled={!signatureDataUrl} onClick={placeOnSignaturePage} className="rounded border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50">Add Signature Page</button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" disabled={!placement} onClick={() => moveByKeyboard(-0.01, 0)} className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold disabled:opacity-50">Move Left</button>
              <button type="button" disabled={!placement} onClick={() => moveByKeyboard(0.01, 0)} className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold disabled:opacity-50">Move Right</button>
              <button type="button" disabled={!placement} onClick={() => moveByKeyboard(0, -0.01)} className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold disabled:opacity-50">Move Up</button>
              <button type="button" disabled={!placement} onClick={() => moveByKeyboard(0, 0.01)} className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold disabled:opacity-50">Move Down</button>
              <button type="button" disabled={!placement} onClick={() => resizeByKeyboard(0.02)} className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold disabled:opacity-50">Increase Size</button>
              <button type="button" disabled={!placement} onClick={() => resizeByKeyboard(-0.02)} className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold disabled:opacity-50">Decrease Size</button>
            </div>
          </section>

          <section className="rounded border border-slate-200 bg-white p-4">
            <h3 className="font-semibold text-slate-950">Signature Placement</h3>
            {placement ? (
              <dl className="mt-3 space-y-2 text-sm">
                <div><dt className="text-slate-500">Page</dt><dd className="font-medium text-slate-900">{placement.pageNumber > pageCount ? "Signature Page" : placement.pageNumber}</dd></div>
                <div><dt className="text-slate-500">Signer</dt><dd className="font-medium text-slate-900">{approverName}</dd></div>
                <div><dt className="text-slate-500">Role</dt><dd className="font-medium text-slate-900">{approverRole}</dd></div>
                <div><dt className="text-slate-500">Step</dt><dd className="font-medium text-slate-900">{stepName}</dd></div>
                <div><dt className="text-slate-500">Placement Status</dt><dd className="font-medium text-emerald-700">Ready</dd></div>
              </dl>
            ) : (
              <p className="mt-3 text-sm text-slate-500">No signature placement yet.</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => setMethod("drawn")} className="rounded border border-slate-300 px-3 py-2 text-sm font-semibold">Change Signature</button>
              <button type="button" disabled={!placement} onClick={() => setPlacement(null)} className="rounded border border-red-300 px-3 py-2 text-sm font-semibold text-red-700 disabled:opacity-50">Remove Signature</button>
            </div>
          </section>

          <section className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <label className="flex items-start gap-2">
              <input name="visualSignatureConsent" type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1" />
              I confirm that this is my electronic signature and that I intend to approve the displayed document version.
            </label>
            <p className="mt-2">This electronic approval is recorded by the application and is not a PKI digital signature.</p>
          </section>
        </aside>
      </section>

      <textarea name="comment" placeholder="Comment" rows={4} className="w-full rounded border border-slate-300 px-3 py-2" />
      <div className="flex flex-wrap gap-2">
        <SecondaryDecisionButton name="decision" value="revision_requested" className="rounded border border-slate-300 px-3 py-2 text-sm font-semibold">
          Request Revision
        </SecondaryDecisionButton>
        <SecondaryDecisionButton name="decision" value="rejected" className="rounded border border-red-300 px-3 py-2 text-sm font-semibold text-red-700">
          Reject
        </SecondaryDecisionButton>
        <SignatureSubmitButton disabled={!canApprove} documentVersion={documentVersionNumber} documentHash={documentHash} />
      </div>
    </form>
  );
}
