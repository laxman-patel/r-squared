interface ActionOptions {
  delay_ms?: number;
  force?: boolean;
  clear_first?: boolean;
  scroll_into_view?: boolean;
}

interface ActionPayload {
  reasoning: string;
  action_type:
    | "ClickElement"
    | "TypeText"
    | "SelectOption"
    | "HoverElement"
    | "ScrollTo"
    | "WaitFor"
    | "GoToURL"
    | "PressKey"
    | "Finish";
  selector: string;
  value?: string;
  options?: ActionOptions;
  is_complete: boolean;
}

// --- Utility Functions ---

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Robust Element Finder with Retries
 * Waits up to 5 seconds for an element to exist and be visible.
 */
async function findElementSafe(
  selector: string,
  options: { visible?: boolean; timeout?: number } = {},
): Promise<Element> {
  const { visible = true, timeout = 5000 } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const element = document.querySelector(selector);
    if (element) {
      if (!visible) return element;
      if (isElementVisible(element as HTMLElement)) return element;
    }
    await sleep(100); // Polling interval
  }

  throw new Error(
    `Element "${selector}" not found or not visible within ${timeout}ms`,
  );
}

function isElementVisible(el: HTMLElement): boolean {
  return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
}

/**
 * Ensures the element is scrolled into view before interaction.
 */
async function ensureInView(element: HTMLElement): Promise<void> {
  element.scrollIntoView({
    behavior: "smooth",
    block: "center",
    inline: "center",
  });
  // Allow scroll animation to settle slightly
  await sleep(300);
}

/**
 * Dispatches native React/Vue compatible events for inputs.
 */
function triggerInputEvents(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;

  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(element, value);
  } else {
    element.value = value;
  }

  const events = ["input", "change", "blur"];
  events.forEach((eventType) => {
    const event = new Event(eventType, { bubbles: true });
    element.dispatchEvent(event);
  });
}

// --- Main Execution Logic ---

export async function executeAction(action: ActionPayload): Promise<string> {
  const { action_type, selector, value, options = {}, is_complete } = action;

  const {
    delay_ms = 500,
    force = false,
    clear_first = true,
    scroll_into_view = true,
  } = options;

  if (is_complete || action_type === "Finish") {
    return "Workflow Completed";
  }

  if (action_type === "WaitFor") {
    // If value is a number, treat as ms. If selector, wait for element.
    if (selector && selector.startsWith("duration:")) {
      const ms = parseInt(selector.split(":")[1], 10);
      await sleep(ms);
    } else if (selector) {
      await findElementSafe(selector, { visible: true });
    } else {
      await sleep(2000); // Default wait
    }
    return `Waited for ${selector || "duration"}`;
  }

  if (action_type === "GoToURL") {
    if (value) window.location.href = value;
    return `Navigated to ${value}`;
  }

  // 1. Locate Element (Required for most actions)
  let element: Element | null = null;
  if (
    [
      "ClickElement",
      "TypeText",
      "SelectOption",
      "HoverElement",
      "PressKey",
    ].includes(action_type)
  ) {
    try {
      element = await findElementSafe(selector, { visible: !force });
      if (scroll_into_view && element instanceof HTMLElement) {
        await ensureInView(element);
      }
    } catch (e) {
      throw new Error(
        `Failed to find element "${selector}": ${(e as Error).message}`,
      );
    }
  }

  // 2. Execute Specific Action
  switch (action_type) {
    case "ClickElement": {
      if (!element) throw new Error("Element required for ClickElement");

      // Focus first to ensure accessibility/tree order
      (element as HTMLElement).focus();
      await sleep(50);

      // Click
      (element as HTMLElement).click();
      break;
    }

    case "TypeText": {
      if (!element) throw new Error("Element required for TypeText");
      const inputEl = element as HTMLInputElement | HTMLTextAreaElement;

      if (!["INPUT", "TEXTAREA"].includes(inputEl.tagName)) {
        throw new Error("TypeText target must be an input or textarea");
      }

      inputEl.focus();
      await sleep(50);

      if (clear_first) {
        inputEl.select(); // Select text to overwrite
      }

      triggerInputEvents(inputEl, value || "");
      break;
    }

    case "SelectOption": {
      if (!element) throw new Error("Element required for SelectOption");
      const selectEl = element as HTMLSelectElement;

      if (selectEl.tagName !== "SELECT") {
        // Fallback for custom dropdowns (div based)
        (selectEl as HTMLElement).click();
        // In a real robust engine, we'd now find the option in the list and click it.
        // For this simplified engine, we assume standard HTML select or user handles custom via clicks.
        return "Clicked custom dropdown container";
      }

      // Try finding by value, then by visible text
      let optionFound = false;
      for (let i = 0; i < selectEl.options.length; i++) {
        const opt = selectEl.options[i];
        if (opt.value === value || opt.text === value) {
          selectEl.selectedIndex = i;
          triggerInputEvents(selectEl, value);
          optionFound = true;
          break;
        }
      }

      if (!optionFound)
        throw new Error(`Option "${value}" not found in select`);
      break;
    }

    case "HoverElement": {
      if (!element) throw new Error("Element required for HoverElement");
      const hoverEvent = new MouseEvent("mouseover", {
        view: window,
        bubbles: true,
        cancelable: true,
      });
      element.dispatchEvent(hoverEvent);
      break;
    }

    case "ScrollTo": {
      if (element && element instanceof HTMLElement) {
        element.scrollIntoView({ behavior: "smooth", block: "start" });
      } else if (value) {
        // Scroll by Y pixels
        window.scrollBy({ top: parseInt(value, 10), behavior: "smooth" });
      } else {
        throw new Error("ScrollTo requires a selector or a value (pixels)");
      }
      break;
    }

    case "PressKey": {
      if (!element)
        throw new Error(
          "Element required for PressKey (usually focused input)",
        );
      const key = value || "Enter";
      const keyboardEvent = new KeyboardEvent("keydown", {
        key: key,
        code: key,
        bubbles: true,
        cancelable: true,
      });
      element.dispatchEvent(keyboardEvent);
      break;
    }

    default:
      throw new Error(`Unknown action type: ${action_type}`);
  }

  // 3. Post-Action Delay (Allow UI to update)
  await sleep(delay_ms);

  return `Executed ${action_type} on ${selector}`;
}
