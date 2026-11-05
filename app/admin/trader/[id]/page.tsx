import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/supabase";
import { traderBundle } from "@/lib/data";
import TraderView from "@/components/TraderView";
import ConfirmRemove from "@/components/ConfirmRemove";
import { syncUser } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function TraderCard({ params }: { params: { id: string } }) {
  const { sb } = await requireAdmin();
  const b = await traderBundle(sb, params.id);
  if (!b.profile) notFound();
  return (
    <>
      <div className="head"><Link href="/admin" className="fine">← Вся группа</Link>
        <form action={syncUser}><input type="hidden" name="user" value={params.id} /><button className="btn ghost" type="submit">Синхронизировать сейчас</button></form></div>
      <TraderView b={b} mode="admin" />
      <section className="panel"><div className="ph"><h2>Участие в группе</h2></div><ConfirmRemove id={params.id} name={b.profile.name} /></section>
    </>
  );
}
