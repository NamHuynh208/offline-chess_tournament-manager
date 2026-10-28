import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import TechnicalApp from "./TechnicalApp";

export default async function TechnicalPage() {
  const auth = await requireUser("TECHNICAL_ARBITER");
  if (auth.error) redirect(auth.error.status === 401 ? "/login" : "/record");
  const tournaments = await prisma.tournament.findMany({ select: { id: true, name: true }, orderBy: { createdAt: "desc" } });
  return <TechnicalApp tournaments={tournaments} fullName={auth.user.fullName} isAdmin={auth.user.role === "ADMIN"} />;
}
