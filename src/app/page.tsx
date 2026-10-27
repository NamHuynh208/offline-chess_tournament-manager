import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";

export default async function Home() {
  const auth = await requireUser();
  if (auth.error) redirect("/login");
  redirect(auth.user.role === "TECHNICAL_ARBITER" ? "/technical" : "/record");
}
