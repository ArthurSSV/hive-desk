import AuthForm from "@/components/AuthForm";
export default function Page({ searchParams }: { searchParams: { confirmed?: string } }) {
  return <AuthForm mode="login" notice={searchParams.confirmed ? "Email подтверждён. Войдите с вашим email и паролем." : undefined} />;
}
