import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { canManageTournament } from "@/lib/roles";

export default async function Home() {
  const auth = await requireUser();
  if (auth.error) redirect("/login");
  redirect(canManageTournament(auth.user.role) ? "/technical" : "/record");
}
