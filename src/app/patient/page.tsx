import { PatientHome } from "@/components/patient/patient-home";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Patient" };

export default function PatientPage() {
  return <PatientHome />;
}
