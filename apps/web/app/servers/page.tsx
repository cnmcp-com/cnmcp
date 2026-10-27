import { permanentRedirect } from "next/navigation";

export default function LegacyServersPage() {
  permanentRedirect("/projects");
}
