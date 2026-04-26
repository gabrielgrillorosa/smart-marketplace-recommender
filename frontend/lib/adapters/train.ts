import { apiFetch, ApiError } from '@/lib/fetch-wrapper';
import type { TrainJobResponse, TrainStatusResponse, ModelStatusResponse } from '@/lib/types';

export async function postModelTrain(adminKey: string): Promise<TrainJobResponse> {
  const response = await fetch('/api/proxy/model/train', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Key': adminKey,
    },
  });

  if (!response.ok) {
    let body: { jobId?: string } = {};
    try {
      body = await response.json();
    } catch {
      // ignore parse error
    }
    throw new ApiError(response.status, body.jobId ?? `HTTP ${response.status}`);
  }

  return response.json() as Promise<TrainJobResponse>;
}

export async function getModelStatus(): Promise<ModelStatusResponse> {
  return apiFetch<ModelStatusResponse>('/api/proxy/model/status');
}

export async function pollTrainStatus(jobId: string): Promise<TrainStatusResponse> {
  return apiFetch<TrainStatusResponse>(`/api/proxy/model/train/status/${jobId}`);
}
