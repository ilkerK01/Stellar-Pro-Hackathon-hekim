import { listDisputes } from "@/lib/server/hekim";
import { handle } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(() => ({ disputes: listDisputes() }));
}
