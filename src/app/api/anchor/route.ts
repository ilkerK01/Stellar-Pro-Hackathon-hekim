import {
  HekimError,
  refreshRamp,
  sep10Challenge,
  sep10Submit,
  simulateDeposit,
  startDeposit,
} from "@/lib/server/hekim";
import { body, handle, str } from "@/lib/server/http";
import { isAddress } from "@/lib/server/stellar";

export async function POST(req: Request) {
  return handle(async () => {
    const b = await body(req);
    const action = str(b.action, "Action");
    const address = str(b.address, "Address");
    if (!isAddress(address)) throw new HekimError("Invalid Stellar address");
    switch (action) {
      case "challenge":
        return { signable: await sep10Challenge(address) };
      case "token":
        return await sep10Submit(address, str(b.signedXdr, "Signature"));
      case "deposit":
        return await startDeposit(
          address,
          String(b.amountTry ?? ""),
          typeof b.caseId === "string" && b.caseId ? b.caseId : null,
        );
      case "simulate":
        return { ramp: await simulateDeposit(address, str(b.rampId, "Transfer")) };
      case "refresh":
        return { ramp: await refreshRamp(str(b.rampId, "Transfer")) };
      default:
        throw new HekimError("Unknown action");
    }
  });
}
