import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type DocumentVersionDownloadRow = {
  id: string;
  storage_bucket: string;
  storage_path: string;
  document: { project_id: string } | null;
};

export async function GET(_request: Request, { params }: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await params;
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const { data: versionRow, error } = await supabase
    .from("project_document_versions")
    .select("id, storage_bucket, storage_path, document:project_documents!project_document_versions_document_id_fkey(project_id)")
    .eq("id", versionId)
    .maybeSingle();
  const version = versionRow as DocumentVersionDownloadRow | null;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!version) {
    return NextResponse.json({ error: "Document version not found." }, { status: 404 });
  }

  const projectId = version.document?.project_id;

  if (!projectId) {
    return NextResponse.json({ error: "Document project not found." }, { status: 404 });
  }
  const { data: allowed, error: authError } = await supabase.rpc("user_can_access_project", {
    p_project_id: projectId
  });

  if (authError || allowed !== true) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: signedUrl, error: signedUrlError } = await supabase.storage
    .from(version.storage_bucket)
    .createSignedUrl(version.storage_path, 60);

  if (signedUrlError || !signedUrl) {
    return NextResponse.json({ error: signedUrlError?.message ?? "Could not create signed URL." }, { status: 500 });
  }

  return NextResponse.redirect(signedUrl.signedUrl);
}
