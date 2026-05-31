import { SessionGuard } from "../components/SessionGuard";

export default function MerchantsLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return <SessionGuard>{children}</SessionGuard>;
}
