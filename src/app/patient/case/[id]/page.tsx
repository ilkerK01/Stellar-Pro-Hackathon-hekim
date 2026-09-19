import { PatientCase } from "@/components/patient/patient-case";
import type { Metadata } from "next";

export async function generateMetadata({ params }: PageProps<"/patient/case/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: id };
}

export default async function PatientCasePage({ params }: PageProps<"/patient/case/[id]">) {
  const { id } = await params;
  return <PatientCase id={id} />;
}
