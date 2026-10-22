import { createSeed } from "@/lib/seed";
import { LoginForm, type DemoAccount } from "./login-form";

export default function LoginPage() {
  const demo = process.env.DEMO_MODE === "1";
  let accounts: DemoAccount[] = [];
  if (demo) {
    const seed = createSeed(new Date("2026-01-05T10:00:00+05:00"));
    const deptName = (id: string) => seed.departments.find((d) => d.id === id)?.name ?? "";
    accounts = seed.people.map((p) => ({ name: p.name, email: p.email, role: p.role, title: p.title, hue: p.hue, initials: p.initials, department: deptName(p.departmentId) }));
  }
  return <LoginForm demo={demo} accounts={accounts} />;
}
