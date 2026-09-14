import type { Metadata } from "next";
import { headers } from "next/headers";
import { checkPreviewAccess } from "../lib/preview-access.mjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "Document to Excel | Private preview",
  description: "A workspace for turning document tables into editable spreadsheets.",
  robots: { index: false, follow: false }
};
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Defense in depth if a host ever skips Proxy for an HTML request.
  const requestHeaders = await headers();
  const access = await checkPreviewAccess(requestHeaders.get("authorization"), {
    username: process.env.PREVIEW_ACCESS_USERNAME,
    password: process.env.PREVIEW_ACCESS_PASSWORD
  });
  return <html lang="en"><body>{access === "allowed" ? children :
    <main className="locked"><h1>Private preview</h1><p>Preview access is required.</p></main>
  }</body></html>;
}
