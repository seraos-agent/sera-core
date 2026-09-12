/**
 * Shared types for GoalBridge domain execution handlers.
 */
export type EmitResultFn = (
  requestId: string,
  success: boolean,
  data: Record<string, any>,
  errorMessage?: string
) => void;
