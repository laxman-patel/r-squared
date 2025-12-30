import { record, EventType, IncrementalSource } from "rrweb";
import { snapshot } from "rrweb-snapshot";

export function startDomRecording() {
  const events: any[] = [];

  const stopFn = record({
    emit(event: any) {
      if (shouldKeepEvent(event)) {
        events.push(simplifyEvent(event));
      }
    },

    // Reduce capture frequency
    sampling: {
      mousemove: false, // Disable completely
      mouseInteraction: true,
      scroll: 150, // Sample every 150ms
      media: 800,
      input: "last", // Only keep last input value
    },

    // Don't record these
    blockClass: "no-record",
    maskInputOptions: {
      password: true,
    },

    // Reduce snapshot size
    inlineStylesheet: false,
    inlineImages: false,
  });

  return {
    stop: () => {
      if (stopFn) stopFn();
      return events;
    },
  };
}

function shouldKeepEvent(event: any) {
  // Keep full snapshot (needed for context)
  if (event.type === EventType.FullSnapshot) {
    return true;
  }

  // Keep meta info
  if (event.type === EventType.Meta) {
    return true;
  }

  // Filter incremental snapshots
  if (event.type === EventType.IncrementalSnapshot) {
    const dominated = [
      IncrementalSource.MouseInteraction, // clicks
      IncrementalSource.Input, // typing
      IncrementalSource.Scroll, // scrolling (optional)
    ];

    if (event.data && typeof event.data.source === "number") {
      return dominated.includes(event.data.source);
    }
    return false;
  }

  return false;
}

function simplifyEvent(event: any) {
  // Reduce full snapshot size dramatically
  if (event.type === EventType.FullSnapshot) {
    return {
      type: event.type,
      timestamp: event.timestamp,
      // Only keep structure, not styles
      data: simplifySnapshot(event.data),
    };
  }

  return event;
}

function simplifySnapshot(data: any) {
  // Recursively strip unnecessary data from snapshot
  function stripNode(node: any): any {
    if (!node) return node;

    const stripped: any = {
      type: node.type,
      id: node.id,
      tagName: node.tagName,
    };

    // Keep only relevant attributes
    if (node.attributes) {
      const keep = [
        "id",
        "class",
        "name",
        "type",
        "href",
        "placeholder",
        "aria-label",
        "data-testid",
        "role",
        "value",
      ];
      stripped.attributes = {};

      for (const attr of keep) {
        if (node.attributes[attr]) {
          stripped.attributes[attr] = node.attributes[attr];
        }
      }
    }

    // Keep text content
    if (node.textContent) {
      stripped.textContent = node.textContent.slice(0, 200);
    }

    // Process children
    if (node.childNodes) {
      stripped.childNodes = node.childNodes.map(stripNode);
    }

    return stripped;
  }

  return {
    node: stripNode(data.node),
  };
}

export function captureDomSnapshot(): string {
  const domSnapshot = snapshot(document);
  const event = {
    type: 2,
    timestamp: Date.now(),
    data: simplifySnapshot(domSnapshot),
  };
  return JSON.stringify(event);
}
