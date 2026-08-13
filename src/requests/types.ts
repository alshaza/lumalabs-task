export type RequestStatus = "pending" | "generating" | "completed" | "failed";

export interface CreateRequestInput {
  sku: string;
  shotIdea: string;
  requestedBy: string;
}
