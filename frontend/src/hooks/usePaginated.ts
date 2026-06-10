"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, Paginated } from "@/lib/api";

export function usePaginated<T>(path: string, filters: Record<string, string | number | undefined> = {}) {
  const [data, setData] = useState<T[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const filterKey = JSON.stringify(filters);
  const seq = useRef(0);

  const load = useCallback(async (p: number) => {
    const current = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const res = await api<Paginated<T>>(path, { params: { ...JSON.parse(filterKey), page: p } });
      if (current !== seq.current) return;
      setData(res.data);
      setLastPage(res.last_page);
      setTotal(res.total);
      setPage(res.current_page);
    } catch (e) {
      if (current === seq.current) setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      if (current === seq.current) setLoading(false);
    }
  }, [path, filterKey]);

  useEffect(() => {
    load(1);
  }, [load]);

  return { data, page, lastPage, total, loading, error, setPage: load, reload: () => load(page) };
}
