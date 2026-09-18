import { useCallback, useState } from "react";
import { toast } from "../../client/hooks/use-toast";
import { errorMessage } from "./labels";

/**
 * Runs an operation call with a pending flag, reporting failures as a toast.
 * Resolves to whether it succeeded, so callers know when to close a dialog.
 */
export function useSubmit() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = useCallback(
    async (run: () => Promise<unknown>, failureTitle: string) => {
      setIsSubmitting(true);
      try {
        await run();
        return true;
      } catch (error) {
        toast({
          title: failureTitle,
          description: errorMessage(error),
          variant: "destructive",
        });
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [],
  );

  return { isSubmitting, submit };
}
