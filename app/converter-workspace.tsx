"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient, hasSupabaseBrowserConfig } from "../lib/supabase-browser";
import type { CellValue, DocumentRecord, DocumentRow } from "../lib/document-types";
import type { Json } from "../lib/database.types";

const allowedTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

function safeFileName(name: string) {
  return name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(-120) || "document";
}

function friendlyStatus(status?: DocumentRecord["status"]) {
  return ({ uploading: "Uploading…", queued: "Waiting to process…", processing: "Extracting the table…", completed: "Ready to review", failed: "Conversion failed" })[status ?? "uploading"];
}

export function ConverterWorkspace() {
  const supabase = getSupabaseBrowserClient();
  const configured = hasSupabaseBrowserConfig();
  const fileInput = useRef<HTMLInputElement>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [document, setDocument] = useState<DocumentRecord | null>(null);
  const [rows, setRows] = useState<DocumentRow[]>([]);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!configured) {
      setAuthReady(true);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, [configured, supabase]);

  const refreshDocument = useCallback(async (id: string) => {
    const { data, error } = await supabase.from("documents").select("*").eq("id", id).single();
    if (error || !data) return;
    setDocument(data as unknown as DocumentRecord);
    if (data.status === "completed") {
      const result = await supabase.from("document_rows").select("*").eq("document_id", id).order("row_number");
      if (!result.error && result.data) setRows(result.data as unknown as DocumentRow[]);
    }
  }, [supabase]);

  useEffect(() => {
    if (!document || !["uploading", "queued", "processing"].includes(document.status)) return;
    const timer = window.setInterval(() => refreshDocument(document.id), 2500);
    return () => window.clearInterval(timer);
  }, [document, refreshDocument]);

  async function handleAuth(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const result = authMode === "signup"
      ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } })
      : await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (result.error) return setMessage(result.error.message);
    if (authMode === "signup" && !result.data.session) {
      setMessage("Check your email, confirm the account, then return here to sign in.");
      setAuthMode("signin");
    } else {
      setMessage("Signed in. You can upload a document now.");
    }
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !session) return;
    if (!allowedTypes.has(file.type)) return setMessage("Choose a PDF, JPG, PNG or WebP file.");
    if (file.size > 20 * 1024 * 1024) return setMessage("The preview limit is 20 MB per file.");

    setBusy(true);
    setMessage("");
    setRows([]);
    const id = crypto.randomUUID();
    const path = `${session.user.id}/${id}/${safeFileName(file.name)}`;
    const baseRecord = {
      id,
      user_id: session.user.id,
      original_name: file.name,
      storage_path: path,
      mime_type: file.type,
      size_bytes: file.size,
      status: "uploading"
    };
    const inserted = await supabase.from("documents").insert(baseRecord).select().single();
    if (inserted.error || !inserted.data) {
      setBusy(false);
      return setMessage("The document record could not be created. Please sign in again.");
    }
    setDocument(inserted.data as unknown as DocumentRecord);

    const uploaded = await supabase.storage.from("documents").upload(path, file, {
      contentType: file.type,
      cacheControl: "0",
      upsert: false
    });
    if (uploaded.error) {
      await supabase.from("documents").update({ status: "failed", error_code: "upload_failed" }).eq("id", id);
      setBusy(false);
      return setMessage("Upload failed. Please try the file again.");
    }

    await supabase.from("documents").update({ status: "queued", updated_at: new Date().toISOString() }).eq("id", id);
    await refreshDocument(id);
    const response = await fetch("/.netlify/functions/process-document-background", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-supabase-authorization": `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ documentId: id })
    });
    setBusy(false);
    if (!response.ok) {
      await supabase.from("documents").update({ status: "failed", error_code: "processor_unavailable" }).eq("id", id);
      await refreshDocument(id);
      return setMessage("The processor could not start. Try again shortly.");
    }
    setMessage("Upload complete. Extraction is running in the background.");
  }

  function changeCell(rowIndex: number, column: string, value: string) {
    setRows((current) => current.map((row, index) => index === rowIndex
      ? { ...row, row_data: { ...row.row_data, [column]: value } }
      : row));
    setDirty(true);
  }

  async function saveRows() {
    if (!document || !session || !dirty) return true;
    setBusy(true);
    const payload = rows.map((row) => ({
      document_id: document.id,
      user_id: session.user.id,
      row_number: row.row_number,
      row_data: row.row_data as Json,
      updated_at: new Date().toISOString()
    }));
    const result = await supabase.from("document_rows").upsert(payload, { onConflict: "document_id,row_number" });
    setBusy(false);
    if (result.error) {
      setMessage("Your edits could not be saved.");
      return false;
    }
    setDirty(false);
    setMessage("Edits saved.");
    return true;
  }

  async function downloadExcel() {
    if (!document || !session || !(await saveRows())) return;
    setBusy(true);
    setMessage("Preparing your Excel file…");
    const response = await fetch(`/api/documents/${document.id}/export`, {
      method: "POST",
      headers: { "x-supabase-authorization": `Bearer ${session.access_token}` }
    });
    const result = await response.json() as { url?: string; error?: string };
    setBusy(false);
    if (!response.ok || !result.url) return setMessage(result.error || "Excel export failed.");
    setMessage("Download ready. The private link expires in 60 seconds.");
    window.location.assign(result.url);
  }

  if (!authReady) return <div className="upload-panel"><p>Opening your secure workspace…</p></div>;

  if (!configured) return <div className="upload-panel"><p>This deployment is missing its Supabase connection values.</p></div>;

  if (!session) return <div className="converter-shell">
    <div className="auth-copy">
      <span className="upload-icon" aria-hidden="true">↗</span>
      <h3>Sign in to convert a document</h3>
      <p>Your PDF or image will upload directly to private storage. Create a test account to begin.</p>
    </div>
    <form className="auth-form" onSubmit={handleAuth}>
      <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></label>
      <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete={authMode === "signup" ? "new-password" : "current-password"} /></label>
      <button className="button primary" disabled={busy}>{busy ? "Please wait…" : authMode === "signup" ? "Create test account" : "Sign in"}</button>
      <button type="button" className="text-button" onClick={() => { setAuthMode(authMode === "signup" ? "signin" : "signup"); setMessage(""); }}>
        {authMode === "signup" ? "Already registered? Sign in" : "Need an account? Create one"}
      </button>
      {message && <p className="form-message" role="status">{message}</p>}
    </form>
  </div>;

  return <div className="converter-shell">
    <div className="converter-toolbar">
      <div><strong>{session.user.email}</strong><small>Private workspace</small></div>
      <button className="text-button" onClick={() => supabase.auth.signOut()}>Sign out</button>
    </div>

    {!document && <div className="upload-panel active-upload">
      <span className="upload-icon" aria-hidden="true">↑</span>
      <h3>Choose a PDF or image</h3>
      <p>PDF, JPG, PNG or WebP · maximum 20 MB</p>
      <input ref={fileInput} className="sr-only" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={handleFile} />
      <button className="button primary" disabled={busy} onClick={() => fileInput.current?.click()}>Choose a document</button>
    </div>}

    {document && <div className="real-review">
      <div className="real-review-head">
        <div><strong>{document.original_name}</strong><small>{friendlyStatus(document.status)}</small></div>
        <button className="text-button" disabled={busy} onClick={() => { setDocument(null); setRows([]); setMessage(""); }}>Convert another</button>
      </div>
      {["uploading", "queued", "processing"].includes(document.status) && <div className="processing-state"><span/><p>{friendlyStatus(document.status)} You can leave this tab and return later.</p></div>}
      {document.status === "failed" && <div className="error-state"><p>Conversion failed ({document.error_code || "unknown error"}). Try a clearer file or image.</p></div>}
      {document.status === "completed" && <>
        {document.warnings.length > 0 && <div className="warning-box"><strong>Check these details</strong>{document.warnings.map((warning, index) => <p key={index}>{warning}</p>)}</div>}
        <div className="table-scroll"><table className="extracted-table"><thead><tr><th>#</th>{document.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>
          {rows.map((row, rowIndex) => <tr key={row.id}><th>{row.row_number}</th>{document.columns.map((column) => <td key={column}><input aria-label={`${column}, row ${row.row_number}`} value={String(row.row_data[column] ?? "")} onChange={(e) => changeCell(rowIndex, column, e.target.value)} /></td>)}</tr>)}
        </tbody></table></div>
        <div className="conversion-actions">
          <button className="button secondary" disabled={busy || !dirty} onClick={saveRows}>Save changes</button>
          <button className="button primary" disabled={busy || rows.length === 0} onClick={downloadExcel}>Download Excel</button>
        </div>
      </>}
    </div>}
    {message && <p className="form-message" role="status">{message}</p>}
  </div>;
}
