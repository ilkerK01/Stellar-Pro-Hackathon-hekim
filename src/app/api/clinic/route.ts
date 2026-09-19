import { clinicProfile, clinicRamps, clinicWithdraw, HekimError, refreshRamp } from "@/lib/server/hekim";
import { body, handle, str } from "@/lib/server/http";
import { walletState } from "@/lib/server/stellar";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const profile = await clinicProfile();
    return { profile, wallet: await walletState(profile.address), ramps: clinicRamps() };
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const b = await body(req);
    const action = str(b.action, "Action");
    if (action === "withdraw") {
      return {
        ramp: await clinicWithdraw(
          String(b.amount ?? ""),
          typeof b.caseId === "string" && b.caseId ? b.caseId : null,
        ),
      };
    }
    if (action === "refresh") return { ramp: await refreshRamp(str(b.rampId, "Transfer")) };
    throw new HekimError("Unknown action");
  });
}
