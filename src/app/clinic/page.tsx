import { ClinicDesk } from "@/components/clinic-desk";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Clinic" };

export default function ClinicPage() {
  return <ClinicDesk />;
}
