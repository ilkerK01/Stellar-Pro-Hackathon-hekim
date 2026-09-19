import {
  acceptCase,
  clinicClaim,
  completeStage,
  getCase,
  prepareApprove,
  prepareDispute,
  prepareFund,
  releaseStage,
  resolveDispute,
  retryRegistry,
  rules,
  submitPatient,
  HekimError,
} from "@/lib/server/hekim";
import { body, handle, int, str } from "@/lib/server/http";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/cases/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    return { case: getCase(id), rules: rules() };
  });
}

export async function POST(req: NextRequest, ctx: RouteContext<"/api/cases/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const b = await body(req);
    const action = str(b.action, "Action");
    switch (action) {
      case "accept":
        return { case: await acceptCase(id, str(b.address, "Address"), str(b.email, "Email")) };
      case "prepare-fund":
        return { signable: await prepareFund(id, str(b.address, "Address")) };
      case "prepare-approve":
        return { signable: await prepareApprove(id, str(b.address, "Address"), int(b.idx, "Stage")) };
      case "prepare-dispute":
        return {
          signable: await prepareDispute(id, str(b.address, "Address"), int(b.idx, "Stage"), String(b.note ?? "")),
        };
      case "submit": {
        const kind = str(b.kind, "Kind");
        if (kind !== "fund" && kind !== "approve" && kind !== "dispute") {
          throw new HekimError("Unknown signed action");
        }
        return { case: await submitPatient(id, str(b.address, "Address"), kind, str(b.signedXdr, "Signature")) };
      }
      case "release":
        return { case: await releaseStage(id, int(b.idx, "Stage")) };
      case "complete":
        return { case: await completeStage(id, int(b.idx, "Stage"), String(b.evidence ?? "")) };
      case "claim": {
        const kind = str(b.kind, "Kind");
        if (kind !== "no_response" && kind !== "no_show") throw new HekimError("Unknown claim");
        return { case: await clinicClaim(id, int(b.idx, "Stage"), kind, String(b.note ?? "")) };
      }
      case "resolve":
        return {
          case: await resolveDispute(id, int(b.idx, "Stage"), Number(b.patientPercent), Boolean(b.refundRest)),
        };
      case "registry":
        return { case: await retryRegistry(id) };
      default:
        throw new HekimError("Unknown action");
    }
  });
}
