import { NoPrivy } from "@/components/patient/no-privy";
import { PatientProviders } from "@/components/patient/wallet";

export default function PatientLayout({ children }: LayoutProps<"/patient">) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!appId) return <NoPrivy />;
  return <PatientProviders appId={appId}>{children}</PatientProviders>;
}
