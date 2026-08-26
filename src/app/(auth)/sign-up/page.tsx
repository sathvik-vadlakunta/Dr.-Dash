import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { AuthForm } from "@/components/ui/Field";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Create an account" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await getSession();
  const { next } = await searchParams;
  if (session) redirect(next ?? "/dashboard");

  return <AuthForm mode="sign-up" next={next ?? "/dashboard"} />;
}
