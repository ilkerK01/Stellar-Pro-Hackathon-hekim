"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import type { CaseView, Rules } from "@/lib/types";

export function useCase(id: string, interval = 5000) {
  const [caseView, setCaseView] = useState<CaseView | null>(null);
  const [rules, setRules] = useState<Rules | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await api<{ case: CaseView; rules: Rules }>(`/api/cases/${id}`);
      setCaseView(res.case);
      setRules(res.rules);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [id]);

  useEffect(() => {
    reload();
    const timer = setInterval(reload, interval);
    return () => clearInterval(timer);
  }, [reload, interval]);

  const act = useCallback(
    async (body: Record<string, unknown>) => {
      const res = await api<{ case: CaseView }>(`/api/cases/${id}`, { body });
      setCaseView(res.case);
      return res.case;
    },
    [id],
  );

  return { caseView, rules, error, reload, act, setCaseView };
}
