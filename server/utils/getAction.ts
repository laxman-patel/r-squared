import generatePrompt from "./prompt";
import { OpenRouter } from "@openrouter/sdk";

export interface WEC {
  jsonl: string;
  image: string;
}

export interface StaticFiles {
  jsonl: string;
  images: string[];
}

export interface ActionResponse {
  reasoning: string;
  action_type: "ClickElement" | "TypeText" | "SelectOption" | "HoverElement" | "ScrollTo" | "WaitFor" | "GoToURL" | "PressKey" | "Finish";
  selector?: string;
  value?: string;
  options?: {
    delay_ms?: number;
    force?: boolean;
    clear_first?: boolean;
    scroll_into_view?: boolean;
  };
  is_complete: boolean;
}

export async function getAction(
  history: WEC[],
  staticFiles: StaticFiles,
): Promise<ActionResponse> {
  console.log(`getAction called with ${history.length} WEC items`);
  console.log(
    `Static files loaded: 1 JSONL and ${staticFiles.images.length} images`,
  );

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY not found in environment");
  }

  const contextParts: string[] = [];

  contextParts.push("## Workflow Foundation (The Trace)\n");
  contextParts.push("### DOM Snapshots (JSONL):\n");
  contextParts.push(staticFiles.jsonl);
  contextParts.push(`\n\n### Screenshots (${staticFiles.images.length}):\n`);
  staticFiles.images.forEach((_, index) => {
    contextParts.push(`Screenshot ${index + 1}: [attached as image]`);
  });

  contextParts.push("\n\n## Execution History\n");
  history.forEach((wec, index) => {
    contextParts.push(`### Turn ${index + 1}\n`);
    contextParts.push("### Current State (Reality) - JSONL Context:\n");
    contextParts.push(wec.jsonl);
    contextParts.push(
      "\nCurrent State (Reality) - Screenshot: [attached as image]\n",
    );
  });

  const userPrompt = `${contextParts.join("\n")}\n\nBased on the Workflow Foundation, Execution History, and the latest Current State, determine the next action.`;

  const systemPrompt = generatePrompt();

  const messages: any[] = [
    {
      role: "system",
      content: systemPrompt,
    },
  ];

  const textParts: any[] = [{ type: "text", text: userPrompt }];

  staticFiles.images.forEach((img) => {
    textParts.push({
      type: "image_url",
      image_url: {
        url: `data:image/png;base64,${img}`,
      },
    });
  });

  history.forEach((wec) => {
    textParts.push({
      type: "image_url",
      image_url: {
        url: `data:image/png;base64,${wec.image}`,
      },
    });
  });

  messages.push({
    role: "user",
    content: textParts,
  });

  const openrouter = new OpenRouter({
    apiKey: apiKey,
  });

  const response = await openrouter.chat.send({
    model: "google/gemini-3-flash-preview",
    messages: messages,
    responseFormat: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("Invalid response from AI");
  }

  const aiResponse = JSON.parse(content);

  return aiResponse;
}
