import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import RecordApp from "./RecordApp";

export default async function RecordPage() {
  const auth = await requireUser();
  if (auth.error) redirect("/login");
  const tournaments = await prisma.tournament.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, primaryColor: true, rounds: { select: { number: true }, orderBy: { number: "asc" } } },
  });
  return (
    <RecordApp
      user={{ id: auth.user.id, fullName: auth.user.fullName }}
      tournaments={tournaments.map((t) => ({ ...t, rounds: t.rounds.map((r) => r.number) }))}
    />
  );
}
