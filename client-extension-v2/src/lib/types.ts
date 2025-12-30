export interface WECMessage {
  workflowId?: string;
  userPrompt?: string;
  wec: {
    jsonl: string;
    image: string;
  };
}

export interface WSResponse {
  is_complete: boolean;
  message: string;
  data: ActionPayload;
}

export interface ActionPayload {
  reasoning: string;
  action_type: "ClickElement" | "TypeText" | "SelectOption" | "HoverElement" | "ScrollTo" | "WaitFor" | "GoToURL" | "PressKey" | "Finish";
  selector: string;
  value?: string;
  options?: ActionOptions;
  is_complete: boolean;
}

export interface ActionOptions {
  delay_ms?: number;
  force?: boolean;
  clear_first?: boolean;
  scroll_into_view?: boolean;
}
