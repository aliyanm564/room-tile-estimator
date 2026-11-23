import { describe, expect, it, vi } from "vitest";
import { selectAllOnFocus } from "@/lib/select-on-focus";

/** A stand-in for an <input> that behaves like the browser for typing over a selection. */
function fakeInput(value: string) {
  const el = {
    value,
    dataset: {} as DOMStringMap,
    selection: [value.length, value.length] as [number, number],
    setSelectionRange(start: number, end: number) {
      el.selection = [start, end];
    },
    type(text: string) {
      const [s, e] = el.selection;
      el.value = el.value.slice(0, s) + text + el.value.slice(e);
      el.selection = [s + text.length, s + text.length];
    },
  };
  return el;
}
const event = <T,>(currentTarget: T) => ({ currentTarget, preventDefault: vi.fn() });

describe("select all on focus (closet / built-in size fields)", () => {
  it("typing after focus REPLACES the pre-filled AI value instead of appending", () => {
    const el = fakeInput("5");
    el.type("6"); // without the handler: appends
    expect(el.value).toBe("56");

    const field = fakeInput("5");
    selectAllOnFocus.onFocus(event(field));
    expect(field.selection).toEqual([0, 1]);
    field.type("6");
    expect(field.value).toBe("6");
  });

  it("the mouseup right after a click-focus keeps the selection; later clicks place the caret normally", () => {
    const field = fakeInput("2.5");
    selectAllOnFocus.onFocus(event(field));
    const first = event(field);
    selectAllOnFocus.onMouseUp(first);
    expect(first.preventDefault).toHaveBeenCalledOnce();
    const second = event(field);
    selectAllOnFocus.onMouseUp(second);
    expect(second.preventDefault).not.toHaveBeenCalled();
  });

  it("tabbing in then out doesn't swallow a later click", () => {
    const field = fakeInput("3");
    selectAllOnFocus.onFocus(event(field));
    selectAllOnFocus.onBlur(event(field));
    const click = event(field);
    selectAllOnFocus.onMouseUp(click);
    expect(click.preventDefault).not.toHaveBeenCalled();
  });
});
