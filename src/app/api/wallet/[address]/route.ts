import { anchorSession, HekimError, patientRamps } from "@/lib/server/hekim";
import { body, handle, str } from "@/lib/server/http";
import {
  buildTrustlineXdr,
  fundWithFriendbot,
  isAddress,
  isTrustlineFor,
  submitXdr,
  walletState,
} from "@/lib/server/stellar";
import { env } from "@/lib/server/env";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

async function address(ctx: RouteContext<"/api/wallet/[address]">) {
  const { address } = await ctx.params;
  if (!isAddress(address)) throw new HekimError("Invalid Stellar address");
  return address;
}

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/wallet/[address]">) {
  return handle(async () => {
    const a = await address(ctx);
    return {
      wallet: await walletState(a),
      anchorSession: anchorSession(a),
      ramps: patientRamps(a),
    };
  });
}

export async function POST(req: NextRequest, ctx: RouteContext<"/api/wallet/[address]">) {
  return handle(async () => {
    const a = await address(ctx);
    const b = await body(req);
    const action = str(b.action, "Action");
    if (action === "activate") {
      await fundWithFriendbot(a);
      const state = await walletState(a);
      if (state.usdc !== null) return { wallet: state };
      return {
        wallet: state,
        signable: { xdr: await buildTrustlineXdr(a), networkPassphrase: env.networkPassphrase },
      };
    }
    if (action === "trustline") {
      const signed = str(b.signedXdr, "Signature");
      if (!isTrustlineFor(signed, a)) throw new HekimError("Only a USDC trustline can be submitted here");
      const hash = await submitXdr(signed);
      return { hash, wallet: await walletState(a) };
    }
    throw new HekimError("Unknown action");
  });
}
