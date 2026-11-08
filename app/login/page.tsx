import AuthForm from "@/components/AuthForm";
export default function Page({ searchParams }: { searchParams: { confirmed?: string; e?: string } }) {
  const notice = searchParams.e === "link" ? "Ссылка устарела или уже использована. Запросите новую через «Забыли пароль?»." : searchParams.confirmed ? "Email подтверждён. Войдите с вашим email и паролем." : undefined;
  return <AuthForm mode="login" notice={notice} />;
}
