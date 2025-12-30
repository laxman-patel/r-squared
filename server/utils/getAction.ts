export interface WEC {
  jsonl: string;
  image: string;
}

export interface StaticFiles {
  jsonl: string;
  images: string[];
}

export interface ActionResponse {
  is_complete: boolean;
  message?: string;
  data?: any;
}

export async function getAction(
  history: WEC[],
  staticFiles: StaticFiles,
): Promise<ActionResponse> {
  console.log(`getAction called with ${history.length} WEC items`);
  console.log(`Static files loaded: 1 JSONL and ${staticFiles.images.length} images`);

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY not found in environment");
  }

  const contextParts: string[] = [];

  contextParts.push("## Static Workflow Files\n");
  contextParts.push("### DOM Snapshots (JSONL):\n");
  contextParts.push(staticFiles.jsonl);
  contextParts.push(`\n\n### Screenshots (${staticFiles.images.length}):\n`);
  staticFiles.images.forEach((_, index) => {
    contextParts.push(`Screenshot ${index + 1}: [attached as image]`);
  });

  contextParts.push("\n\n## Execution History\n");
  history.forEach((wec, index) => {
    contextParts.push(`### Turn ${index + 1}\n`);
    contextParts.push("JSONL Context:\n");
    contextParts.push(wec.jsonl);
    contextParts.push("\nScreenshot: [attached as image]\n");
  });

  const userPrompt = `${contextParts.join("\n")}\n\nDetermine the next action based on the provided DOM snapshots, screenshots, and execution history. Respond with a JSON object containing 'is_complete' (boolean), 'message' (string), and 'data' (object with action details if applicable).`;

  const systemPrompt = "You are an AI assistant that helps automate browser interactions. Analyze the provided DOM snapshots and screenshots to determine the next action. Return a JSON response with 'is_complete' (boolean), 'message' (string), and 'data' (object with action details).";

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

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.0-flash-exp:free",
      messages: messages,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("OpenRouter API error:", errorText);
    throw new Error(`OpenRouter API error: ${response.statusText}`);
  }

  const result: any = await response.json();
  const aiResponse = JSON.parse(result.choices[0].message.content);

  return {
    is_complete: aiResponse.is_complete ?? false,
    message: aiResponse.message,
    data: aiResponse.data,
  };
}
