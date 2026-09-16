import type { Metadata } from "next";
import { headers } from "next/headers";
import { checkPreviewAccess, isPublicProduction } from "../lib/preview-access.mjs";
import "./globals.css";

const publicProduction = isPublicProduction(process.env.CONTEXT);

export const metadata: Metadata = {
  title: publicProduction ? "Document to Excel" : "Document to Excel | Private preview",
  description: "A workspace for turning document tables into editable spreadsheets.",
  robots: publicProduction ? { index: true, follow: true } : { index: false, follow: false }
};
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  if (publicProduction) return <html lang="en"><body>{children}</body></html>;
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
