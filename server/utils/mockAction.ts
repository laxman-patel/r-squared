
export interface WEC {
  jsonl: string;
  image: string; // Base64 encoded
}

export interface StaticFiles {
  jsonl: string;
  images: string[]; // Base64 encoded or paths? Prompt says "retrieved files", likely content if passed to function
}

export interface ActionResponse {
  is_complete: boolean;
  message?: string;
  data?: any;
}

export async function getAction(
  history: WEC[],
  staticFiles: StaticFiles
): Promise<ActionResponse> {
  console.log(`getAction called with ${history.length} WEC items`);
  console.log(`Static files loaded: 1 JSONL and ${staticFiles.images.length} images`);

  // Simulate processing delay
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // logic: if we have received 3 updates, we are done.
  if (history.length >= 3) {
    return {
      is_complete: true,
      message: "Workflow completed successfully",
      data: { result: "final_output" }
    };
  }

  return {
    is_complete: false,
    message: "Processing step " + history.length,
    data: { step: history.length }
  };
}
