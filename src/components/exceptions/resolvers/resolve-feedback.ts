import { useCallback } from 'react';
import { useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { exceptionsQueryKey } from '@/hooks/exceptions';
import { toast } from '@/lib/toast';

/**
 * Run one resolve mutation with the desk's feedback: a toast naming what was
 * done, or the server's reason. The hooks own invalidation (the exception
 * leaves the list, the sidebar counts move); the resolver owns the words.
 */
export function resolveWith<Input>(
  mutation: Pick<UseMutationResult<unknown, Error, Input>, 'mutate'>,
  input: Input,
  done: string,
  onDone?: () => void,
): void {
  mutation.mutate(input, {
    onSuccess: () => {
      toast.success(done);
      onDone?.();
    },
    onError: (error) => toast.error(error.message || 'Could not resolve.'),
  });
}

/**
 * For a resolver that writes through a lane component's own mutations (the
 * paperwork documents, the parcel & label panel): re-read the exceptions so a
 * cleared one leaves the list and the counts move.
 */
export function useExceptionsChanged(): () => void {
  const queryClient = useQueryClient();
  return useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: exceptionsQueryKey });
    void queryClient.invalidateQueries({ queryKey: ['nav-facets'] });
  }, [queryClient]);
}
