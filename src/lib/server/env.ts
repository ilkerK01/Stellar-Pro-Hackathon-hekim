import "server-only";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

export const env = {
  horizonUrl: process.env.HORIZON_URL ?? "https://horizon-testnet.stellar.org",
  networkPassphrase: process.env.NETWORK_PASSPHRASE ?? "Test SDF Network ; September 2015",
  rpcUrl: process.env.SOROBAN_RPC_URL ?? "https://soroban-testnet.stellar.org",
  registryContractId: process.env.REGISTRY_CONTRACT_ID ?? "",
  clinicCountry: process.env.CLINIC_COUNTRY ?? "TR",
  clinicName: process.env.CLINIC_NAME ?? "Bosphorus Dental & Aesthetics",
  friendbotUrl: process.env.FRIENDBOT_URL ?? "https://friendbot.stellar.org",
  usdcCode: "USDC",
  usdcIssuer: process.env.USDC_ISSUER ?? "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
  anchorDomain: process.env.ANCHOR_HOME_DOMAIN ?? "tr-mock-anchor.fly.dev",
  twBaseUrl: process.env.TW_BASE_URL ?? "https://dev.api.trustlesswork.com",
  get twApiKey() {
    return required("TW_API_KEY");
  },
  get platformSecret() {
    return required("PLATFORM_SECRET");
  },
  get clinicSecret() {
    return required("CLINIC_SECRET");
  },
  get arbiterSecret() {
    return required("ARBITER_SECRET");
  },
  platformFeePercent: Number(process.env.PLATFORM_FEE_PERCENT ?? "1"),
  protocolFeePercent: Number(process.env.TW_PROTOCOL_FEE_PERCENT ?? "0.3"),
  approvalWindowMinutes: Number(process.env.APPROVAL_WINDOW_MINUTES ?? "4320"),
  dbPath: process.env.DB_PATH ?? "data/hekim.db",
};
