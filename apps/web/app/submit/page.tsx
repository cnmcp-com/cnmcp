import { permanentRedirect } from "next/navigation";

export default function SubmitPage() {
  permanentRedirect("/doctor");
}
