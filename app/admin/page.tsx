import type { Metadata } from "next";
import AdminConsole from "./admin-console";

export const metadata: Metadata = {
  title: "FrankBroker Admin · Platform control",
  description: "Configure tenants, instruments, users, trading controls, and integrations across the FrankBroker platform.",
};

export default function AdminPage() {
  return <AdminConsole />;
}
