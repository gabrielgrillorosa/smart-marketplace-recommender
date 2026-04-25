'use client';

import { useEffect, useState } from 'react';
import type { ServiceStatus } from '@/lib/types';

const API_SERVICE_URL = '';
const AI_SERVICE_URL = '';

async function checkEndpoint(url: string): Promise<ServiceStatus> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return res.ok ? 'up' : 'down';
  } catch {
    return 'down';
  }
}

export function useServiceHealth(): { apiStatus: ServiceStatus; aiStatus: ServiceStatus } {
  const [apiStatus, setApiStatus] = useState<ServiceStatus>('unknown');
  const [aiStatus, setAiStatus] = useState<ServiceStatus>('unknown');

  useEffect(() => {
    async function poll() {
      const [api, ai] = await Promise.all([
        checkEndpoint(`/backend/actuator/health`),
        checkEndpoint(`/aibackend/ready`),
      ]);
      setApiStatus(api);
      setAiStatus(ai);
    }

    poll();
    const id = setInterval(poll, 30000);
    return () => clearInterval(id);
  }, []);

  return { apiStatus, aiStatus };
}
