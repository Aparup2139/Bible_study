import { useMutation } from '@tanstack/react-query';
import { api } from '../services/api';
import type { AskResponse } from '../types';

/**
 * Sends a question to the AI Bible agent (POST /agent/ask). The backend grounds
 * every answer in scripture and returns the verse references it cited.
 */
export function useAskBible() {
  return useMutation<AskResponse, Error, string>({
    mutationFn: (question: string) => api.post<AskResponse>('/agent/ask', { question }),
  });
}
