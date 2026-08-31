import { UgcAppV2 } from "./ugc/UgcAppV2.jsx";
import { UgcShowcase } from "./ugc/UgcShowcase.jsx";
import "./ugc/ugc-showcase.css";

export function App() {
  const live = new URLSearchParams(window.location.search).get("live") === "1";
  return live ? <UgcAppV2 /> : <UgcShowcase />;
}
