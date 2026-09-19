import { createCase, listCases } from "@/lib/server/hekim";
import { body, handle } from "@/lib/server/http";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handle(() => {
    const email = req.nextUrl.searchParams.get("email") ?? undefined;
    const address = req.nextUrl.searchParams.get("address") ?? undefined;
    return { cases: listCases({ email, address }) };
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const b = await body(req);
    return {
      case: createCase({
        title: String(b.title ?? ""),
        treatment: String(b.treatment ?? ""),
        patientName: String(b.patientName ?? ""),
        patientEmail: String(b.patientEmail ?? ""),
        clinicName: String(b.clinicName ?? ""),
        total: String(b.total ?? ""),
        milestones: Array.isArray(b.milestones)
          ? (b.milestones as { title: string; percent: number }[])
          : [],
      }),
    };
  });
}
