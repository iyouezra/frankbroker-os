import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

const title = "FrankBroker OS · Brokerage operations, under control";
const description = "A controlled broker back-office order management system for Ethiopia’s capital market.";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const image = `${protocol}://${host}/og.png`;

  return {
    title,
    description,
    icons: { icon: "/frankscore-icon.png", shortcut: "/frankscore-icon.png", apple: "/frankscore-icon.png" },
    openGraph: { title, description, type: "website", images: [{ url: image, width: 1200, height: 630, alt: "FrankBroker OS" }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
