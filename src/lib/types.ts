export type CaseStatus = "open" | "accepted" | "funded" | "closed";

export type MilestoneStatus = "pending" | "completed" | "approved" | "released" | "disputed" | "resolved";

export type DisputeKind = "patient" | "no_response" | "no_show" | "cancel";

export type Milestone = {
  idx: number;
  title: string;
  amount: string;
  status: MilestoneStatus;
  evidence: string | null;
  completedAt: string | null;
  approvalDue: string | null;
  disputeKind: DisputeKind | null;
  disputeNote: string | null;
  patientShare: number | null;
  evidenceHash: string | null;
  evidenceTx: string | null;
};

export type CaseEvent = {
  id: number;
  actor: string;
  kind: string;
  detail: string | null;
  txHash: string | null;
  createdAt: string;
};

export type Ramp = {
  id: string;
  party: "patient" | "clinic";
  kind: "deposit" | "withdraw";
  amountIn: string;
  amountOut: string | null;
  status: string;
  paymentHash: string | null;
  createdAt: string;
};

export type CaseView = {
  id: string;
  title: string;
  treatment: string;
  patientName: string;
  patientEmail: string;
  clinicName: string;
  total: string;
  status: CaseStatus;
  patientAddress: string | null;
  contractId: string | null;
  createdAt: string;
  acceptedAt: string | null;
  fundedAt: string | null;
  registryTx: string | null;
  registryCheck: { score: number; cases: number } | null;
  milestones: Milestone[];
  events: CaseEvent[];
  ramps: Ramp[];
  released: string;
  refunded: string;
  locked: string;
};

export type Rules = {
  approvalWindowMinutes: number;
  platformFeePercent: number;
  protocolFeePercent: number;
  noShowPatientPercent: number;
};

export type Signable = {
  xdr: string;
  networkPassphrase: string;
};
