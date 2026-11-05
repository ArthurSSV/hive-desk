import { redirect } from "next/navigation";
import { userClient } from "@/lib/supabase";

export default async function Home({ searchParams }: { searchParams: { code?: string } }) {
  // Письмо подтверждения могло привести на корень сайта с ?code=
  if (searchParams.code) redirect(`/auth/callback?code=${encodeURIComponent(searchParams.code)}`);
  const sb = userClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");
  const { data: p } = await sb.from("profiles").select("role").eq("id", user.id).single();
  redirect(p?.role === "admin" ? "/admin" : "/dashboard");
}
