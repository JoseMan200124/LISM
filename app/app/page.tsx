import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { DashboardView } from "@/components/dashboard-view";
import { EducationalDashboard } from "@/components/educational-dashboard";
import { isEducationalProfile } from "@/lib/lab-profile";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  if (isEducationalProfile()) {
    return <EducationalDashboard role={session.role} />;
  }

  return <DashboardView />;
}
