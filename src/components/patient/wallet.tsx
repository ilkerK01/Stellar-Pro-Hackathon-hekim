"use client";

import { PrivyProvider, usePrivy } from "@privy-io/react-auth";
import { useCreateWallet, useSignRawHash } from "@privy-io/react-auth/extended-chains";
import { Networks, TransactionBuilder } from "@stellar/stellar-sdk";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client/api";
import { sep53Digest } from "@/lib/attest";
import type { Ramp, Signable, SignRequest } from "@/lib/types";

export type WalletInfo = { exists: boolean; xlm: string; usdc: string | null };

type PatientCtx = {
  ready: boolean;
  authenticated: boolean;
  email: string | null;
  address: string | null;
  wallet: WalletInfo | null;
  anchorSession: boolean;
  ramps: Ramp[];
  login: () => void;
  logout: () => Promise<void>;
  createWallet: () => Promise<void>;
  sign: (s: Signable) => Promise<string>;
  signStatement: (r: SignRequest) => Promise<string>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<PatientCtx | null>(null);

const TESTNET = Networks.TESTNET;

function hexToBase64(hex: string): string {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  let binary = "";
  for (let i = 0; i < clean.length; i += 2) binary += String.fromCharCode(parseInt(clean.slice(i, i + 2), 16));
  return btoa(binary);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function Inner({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const { createWallet: create } = useCreateWallet();
  const { signRawHash } = useSignRawHash();
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [anchorSession, setAnchorSession] = useState(false);
  const [ramps, setRamps] = useState<Ramp[]>([]);
  const [createdAddress, setCreatedAddress] = useState<string | null>(null);

  const linked = user?.linkedAccounts.find(
    (a) => a.type === "wallet" && "chainType" in a && (a.chainType as string) === "stellar",
  ) as { address: string } | undefined;
  const address = linked?.address ?? createdAddress;
  const email = user?.email?.address?.toLowerCase() ?? null;

  const refresh = useCallback(async () => {
    if (!address) return;
    try {
      const res = await api<{ wallet: WalletInfo; anchorSession: boolean; ramps: Ramp[] }>(`/api/wallet/${address}`);
      setWallet(res.wallet);
      setAnchorSession(res.anchorSession);
      setRamps(res.ramps);
    } catch {}
  }, [address]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 8000);
    return () => clearInterval(id);
  }, [refresh]);

  const createWallet = useCallback(async () => {
    const res = await create({ chainType: "stellar" });
    setCreatedAddress(res.wallet.address);
  }, [create]);

  const sign = useCallback(
    async (s: Signable) => {
      if (!address) throw new Error("No wallet");
      if (s.networkPassphrase !== TESTNET) throw new Error("Refusing to sign for an unexpected network");
      const tx = TransactionBuilder.fromXDR(s.xdr, TESTNET);
      const { signature } = await signRawHash({
        address,
        chainType: "stellar",
        hash: `0x${bytesToHex(tx.hash())}`,
      });
      tx.addSignature(address, hexToBase64(signature));
      return tx.toXDR();
    },
    [address, signRawHash],
  );

  const signStatement = useCallback(
    async (r: SignRequest) => {
      if (!address) throw new Error("No wallet");
      const expected = await sep53Digest(r.message);
      if (expected !== r.digest) throw new Error("The statement does not match what you were shown");
      const { signature } = await signRawHash({ address, chainType: "stellar", hash: `0x${r.digest}` });
      return signature;
    },
    [address, signRawHash],
  );

  const value = useMemo<PatientCtx>(
    () => ({
      ready,
      authenticated,
      email,
      address,
      wallet,
      anchorSession,
      ramps,
      login,
      logout,
      createWallet,
      sign,
      signStatement,
      refresh,
    }),
    [ready, authenticated, email, address, wallet, anchorSession, ramps, login, logout, createWallet, sign, signStatement, refresh],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function PatientProviders({ appId, children }: { appId: string; children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["email"],
        appearance: { accentColor: "#12546C", landingHeader: "hekim" },
        embeddedWallets: { ethereum: { createOnLogin: "off" }, solana: { createOnLogin: "off" } },
      }}
    >
      <Inner>{children}</Inner>
    </PrivyProvider>
  );
}

export function usePatient(): PatientCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePatient must be used inside PatientProviders");
  return ctx;
}
