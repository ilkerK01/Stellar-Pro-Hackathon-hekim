import { ClinicCase } from "@/components/clinic-case";
import type { Metadata } from "next";

export async function generateMetadata({ params }: PageProps<"/clinic/case/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: id };
}

export default async function ClinicCasePage({ params }: PageProps<"/clinic/case/[id]">) {
  const { id } = await params;
  return <ClinicCase id={id} />;
}
