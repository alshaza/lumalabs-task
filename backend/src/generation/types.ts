export interface GenerateImageInput {
  sourceImageUrl: string;
  prompt: string;
}

export interface GenerateImageOutput {
  status: "completed" | "failed";
  outputs: { url: string }[];
  failureReason?: string;
}
