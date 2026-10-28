import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import UserManager from "./UserManager";

export default async function UsersPage() {
  const auth = await requireUser("ADMIN");
  if (auth.error) redirect(auth.error.status === 401 ? "/login" : "/");
  return <UserManager />;
}
