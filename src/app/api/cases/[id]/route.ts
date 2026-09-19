import {
  acceptCase,
  clinicCheckin,
  clinicClaim,
  clinicSign,
  completeStage,
  getCase,
  prepareApprove,
  prepareDispute,
  prepareFund,
  preparePatientSign,
  releaseStage,
  resolveDispute,
  retryRegistry,
  rules,
  submitPatient,
  submitPatientSign,
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
      case "prepare-dispute": {
        const kind = String(b.kind ?? "patient");
        if (kind !== "patient" && kind !== "not_started" && kind !== "not_finished") {
          throw new HekimError("Unknown claim");
        }
        return {
          signable: await prepareDispute(id, str(b.address, "Address"), int(b.idx, "Stage"), String(b.note ?? ""), kind),
        };
      }
      case "clinic-sign": {
        const phase = str(b.phase, "Phase");
        if (phase !== "entry" && phase !== "exit") throw new HekimError("Unknown phase");
        return await clinicSign(id, int(b.idx, "Stage"), phase, String(b.statement ?? ""));
      }
      case "clinic-checkin":
        return { checkin: clinicCheckin(id, int(b.idx, "Stage")) };
      case "sign-prepare": {
        const phase = str(b.phase, "Phase");
        if (phase !== "entry" && phase !== "exit") throw new HekimError("Unknown phase");
        return {
          request: await preparePatientSign(
            id,
            str(b.address, "Address"),
            int(b.idx, "Stage"),
            phase,
            typeof b.checkin === "string" && b.checkin ? b.checkin : null,
          ),
        };
      }
      case "sign-submit":
        return {
          case: await submitPatientSign(id, str(b.address, "Address"), str(b.nonce, "Nonce"), str(b.signature, "Signature")),
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
