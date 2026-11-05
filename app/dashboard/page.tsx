import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase";
import { traderBundle } from "@/lib/data";
import TraderView from "@/components/TraderView";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const { sb, profile } = await requireUser();
  if (profile.role === "admin") redirect("/admin");
  const b = await traderBundle(sb, profile.id);
  return <TraderView b={b} mode="self" />;
}
