import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import Projector from "./Projector";

export default async function ProjectorPage({ params }: { params: Promise<{ tournamentId: string }> }) {
  const auth = await requireUser("TECHNICAL_ARBITER");
  if (auth.error) redirect(auth.error.status === 401 ? "/login" : "/record");
  const { tournamentId } = await params;
  if (!await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { id: true } })) notFound();
  return <Projector tournamentId={tournamentId} />;
}
