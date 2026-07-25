import { createFileRoute } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { lazy } from "react";

const HeroScene = lazy(() => import("@/components/HeroScene"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Malhar 2026 — 12 · 13 · 14 December" },
      { name: "description", content: "Asia's largest college fest returns. A cinematic 3D flight into Malhar 2026." },
      { property: "og:title", content: "Malhar 2026" },
      { property: "og:description", content: "Asia's largest college fest — 12 · 13 · 14 December 2026." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <ClientOnly fallback={<div className="fixed inset-0 bg-[#050817]" />}>
      <HeroScene />
    </ClientOnly>
  );
}
