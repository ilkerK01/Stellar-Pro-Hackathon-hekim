import { PatientCase } from "@/components/patient/patient-case";
import type { Metadata } from "next";

export async function generateMetadata({ params }: PageProps<"/patient/case/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: id };
}

export default async function PatientCasePage({ params, searchParams }: PageProps<"/patient/case/[id]">) {
  const { id } = await params;
  const query = await searchParams;
  const nonce = typeof query.checkin === "string" ? query.checkin : null;
  const stage = typeof query.stage === "string" ? Number(query.stage) : NaN;
  return <PatientCase id={id} checkin={nonce && Number.isInteger(stage) ? { stage, nonce } : null} />;
}
