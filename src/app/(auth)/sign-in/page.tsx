import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { AuthForm } from "@/components/ui/Field";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await getSession();
  const { next } = await searchParams;
  if (session) redirect(next ?? "/dashboard");

  return <AuthForm mode="sign-in" next={next ?? "/dashboard"} />;
}
