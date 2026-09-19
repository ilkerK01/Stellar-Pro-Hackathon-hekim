import { clinicProfile, rules } from "@/lib/server/hekim";
import { handle } from "@/lib/server/http";
import { rates } from "@/lib/server/anchor";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const [clinic, anchorRates] = await Promise.all([clinicProfile(), rates()]);
    return { rules: rules(), clinic, rates: anchorRates };
  });
}
