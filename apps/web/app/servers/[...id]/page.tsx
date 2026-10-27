import { permanentRedirect } from "next/navigation";

export default function LegacyServerDetailPage() {
  permanentRedirect("/projects");
}
