import "server-only";
import { AnchorError } from "./anchor";
import { HekimError } from "./hekim";
import { TrustlessError } from "./trustless";

export async function handle<T>(fn: () => Promise<T> | T): Promise<Response> {
  try {
    return Response.json(await fn());
  } catch (error) {
    if (error instanceof HekimError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof TrustlessError || error instanceof AnchorError) {
      return Response.json({ error: error.message }, { status: 502 });
    }
    console.error(error);
    const message = error instanceof Error ? error.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function body(req: Request): Promise<Record<string, unknown>> {
  try {
    const data = await req.json();
    if (data && typeof data === "object") return data as Record<string, unknown>;
  } catch {}
  throw new HekimError("Invalid JSON body");
}

export function str(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new HekimError(`${field} is required`);
  return value.trim();
}

export function int(value: unknown, field: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new HekimError(`${field} must be a whole number`);
  return n;
}
