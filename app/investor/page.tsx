import type { Metadata } from "next";
import InvestorApp from "./investor-app";

export const metadata: Metadata = {
  title: "Frank Money · Own a piece of Ethiopia’s growth",
  description: "A clear, calm way to invest in ESX stocks and Government of Ethiopia bonds.",
  openGraph: {
    title: "Frank Money · Own a piece of Ethiopia’s growth",
    description: "Invest in ESX stocks and Government of Ethiopia bonds with confidence.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Frank Money" }],
  },
};

export default function InvestorPage() {
  return <InvestorApp />;
}
