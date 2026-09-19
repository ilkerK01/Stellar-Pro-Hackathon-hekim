export type Phase = "entry" | "exit";
export type Role = "patient" | "clinic";

export const SEP53_PREFIX = "Stellar Signed Message:\n";

export const PHASE_CODE: Record<Phase, number> = { entry: 0, exit: 1 };
export const ROLE_CODE: Record<Role, number> = { patient: 0, clinic: 1 };

export type AttestFields = {
  caseId: string;
  stage: number;
  phase: Phase;
  role: Role;
  statementHash: string;
  at: string;
  nonce: string;
};

export function attestMessage(f: AttestFields): string {
  return JSON.stringify({
    app: "hekim",
    v: 1,
    case: f.caseId,
    stage: f.stage,
    phase: f.phase,
    role: f.role,
    statement: f.statementHash,
    at: f.at,
    nonce: f.nonce,
  });
}

export function patientEntryStatement(clinic: string, stage: number, title: string, scope: string): string {
  return `I am at ${clinic} for stage ${stage + 1} (${title}). I have seen the clinic's scope for this stage: ${scope}`;
}

export function patientExitStatement(stage: number, title: string): string {
  return `Stage ${stage + 1} (${title}) was performed and I have been discharged. This is not an approval of payment and my right to dispute remains.`;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", data)));
}

export async function sep53Digest(message: string): Promise<string> {
  return sha256Hex(SEP53_PREFIX + message);
}
