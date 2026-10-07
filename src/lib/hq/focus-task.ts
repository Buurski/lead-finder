const FOCUS_TASK_EVENT = "hq:focus-task";
// Node har EventTarget/CustomEvent, men ingen window-eventbus.
const target = typeof window === "undefined" ? new globalThis.EventTarget() : window;

export function focusTaskFromHref(href: string): void {
  if (!href.startsWith("/opgaver?")) return;
  const id = new URLSearchParams(href.slice("/opgaver?".length).split("#")[0]).get("task");
  if (id) target.dispatchEvent(new CustomEvent<string>(FOCUS_TASK_EVENT, { detail: id }));
}

export function subscribeTaskFocus(onFocus: (id: string) => void): () => void {
  const listener = (event: Event) => onFocus((event as CustomEvent<string>).detail);
  target.addEventListener(FOCUS_TASK_EVENT, listener);
  return () => target.removeEventListener(FOCUS_TASK_EVENT, listener);
}
