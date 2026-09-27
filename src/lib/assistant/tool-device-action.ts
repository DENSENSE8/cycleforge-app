/**
 * Tool-carried device actions — a SERVER tool that resolves what to do, and
 * the operator's BROWSER that does it.
 *
 * A print is a physical side effect on a computer the server cannot reach: the
 * staffer's print station, over the staff print bridge. The server tool does
 * the part a model must not (resolving order numbers to order rows and to the
 * papers on file, under the org's tenancy); the browser does the part only it
 * can (finding the station, sending once, showing sending → acked → printed).
 *
 * The tool attaches the resolved action to its result under a non-enumerable
 * symbol, so the model's JSON echo never contains it and cannot retype it;
 * the agent loop forwards it to the browser as a `ui_tool` frame after the
 * tool succeeds. Same opt-in branding as report envelopes (`tool-artifact.ts`).
 */

const DEVICE_ACTION = Symbol('cycleforge.deviceAction');

export interface ToolDeviceAction {
  /** The browser verb (`useAssistantChat` handles it by name). */
  name: string;
  input: Record<string, unknown>;
}

/** Stamp a tool result with the browser action it resolved. */
export function attachDeviceAction<T extends object>(data: T, action: ToolDeviceAction): T {
  Object.defineProperty(data, DEVICE_ACTION, { value: action, enumerable: false });
  return data;
}

/** The action a tool result carries, or null for every ordinary result. */
export function takeDeviceAction(data: unknown): ToolDeviceAction | null {
  if (data === null || typeof data !== 'object') return null;
  const action = (data as Record<symbol, unknown>)[DEVICE_ACTION];
  return action && typeof action === 'object' ? (action as ToolDeviceAction) : null;
}
