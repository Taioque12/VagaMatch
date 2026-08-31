import { lazy, Suspense } from "react";
import { UgcShowcase } from "./ugc/UgcShowcase.jsx";
import "./ugc/ugc-showcase.css";

const UgcAppV2 = lazy(() => import("./ugc/UgcAppV2.jsx").then((module) => ({ default: module.UgcAppV2 })));

function LoadingOps() {
  return <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#070814", color: "#cfd4ff", fontFamily: "Inter, system-ui, sans-serif" }}>Inicializando UGC Ops…</div>;
}

export function App() {
  const live = new URLSearchParams(window.location.search).get("live") === "1";
  if (!live) return <UgcShowcase />;
  return <Suspense fallback={<LoadingOps />}><UgcAppV2 /></Suspense>;
}
