import { redirect } from "next/navigation";
import { LockKeyhole, Settings2 } from "lucide-react";
import { AdminLoginForm } from "@/components/admin-login-form";
import { Logo } from "@/components/logo";
import { PublicPageShell } from "@/components/public-page-shell";
import { isAdminAuthenticated } from "@/lib/admin-auth";

export default async function AdminLogin() {
  if (await isAdminAuthenticated()) redirect("/admin");
  return <PublicPageShell className="public-pages public-login public-admin-login">
    <main className="auth-page">
      <aside className="login-identity">
        <Logo />
        <div className="login-seal" aria-hidden="true"><LockKeyhole /><Settings2 /></div>
      </aside>
      <AdminLoginForm />
    </main>
  </PublicPageShell>;
}
