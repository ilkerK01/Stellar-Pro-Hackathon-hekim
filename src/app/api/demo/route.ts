import { createDemoCase } from "@/lib/server/hekim";
import { body, handle, str } from "@/lib/server/http";

export async function POST(req: Request) {
  return handle(async () => {
    const b = await body(req);
    return { case: await createDemoCase(str(b.email, "Email"), String(b.name ?? "")) };
  });
}
