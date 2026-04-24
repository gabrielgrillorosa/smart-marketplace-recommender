'use client';

import React, { createContext, useContext, useState } from 'react';
import type { RecommendationResult } from '@/lib/types';

interface RecommendationContextValue {
  recommendations: RecommendationResult[];
  loading: boolean;
  isFallback: boolean;
  setRecommendations: (recs: RecommendationResult[], isFallback: boolean) => void;
  setLoading: (v: boolean) => void;
  clearRecommendations: () => void;
}

const RecommendationContext = createContext<RecommendationContextValue | null>(null);

export function RecommendationProvider({ children }: { children: React.ReactNode }) {
  const [recommendations, setRecsState] = useState<RecommendationResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [isFallback, setIsFallback] = useState(false);

  function setRecommendations(recs: RecommendationResult[], fallback: boolean) {
    setRecsState(recs);
    setIsFallback(fallback);
  }

  function clearRecommendations() {
    setRecsState([]);
    setIsFallback(false);
    setLoading(false);
  }

  return (
    <RecommendationContext.Provider
      value={{ recommendations, loading, isFallback, setRecommendations, setLoading, clearRecommendations }}
    >
      {children}
    </RecommendationContext.Provider>
  );
}

export function useRecommendations(): RecommendationContextValue {
  const ctx = useContext(RecommendationContext);
  if (!ctx) throw new Error('useRecommendations must be used within RecommendationProvider');
  return ctx;
}
