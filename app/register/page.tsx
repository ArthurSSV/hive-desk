import AuthForm from "@/components/AuthForm";
export default function Page({ searchParams }: { searchParams: { code?: string } }) {
  return <AuthForm mode="register" code={searchParams.code?.slice(0, 40)} />;
}
