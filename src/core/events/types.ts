export interface Event {
  id: string;
  type: string;
  payload: Record<string, any>;
  timestamp: number;
}
