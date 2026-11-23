// "Select everything on focus" for inputs pre-filled with a value the user usually replaces
// (e.g. the AI's closet size): the first keystroke replaces the value instead of appending to it.

/** The parts of an input / event these handlers touch (kept minimal so they're testable in Node). */
interface SelectableInput {
  value: string;
  dataset: DOMStringMap;
  setSelectionRange(start: number, end: number): void;
}
interface InputEvent<T> {
  currentTarget: T;
  preventDefault(): void;
}

const FLAG = "justFocused";

export const selectAllOnFocus = {
  onFocus(e: InputEvent<SelectableInput>) {
    const el = e.currentTarget;
    // setSelectionRange is more reliable than select() on iOS Safari.
    el.setSelectionRange(0, el.value.length);
    el.dataset[FLAG] = "1";
  },
  /** A click focuses on mousedown, then mouseup would place the caret and drop the selection. */
  onMouseUp(e: InputEvent<SelectableInput>) {
    if (e.currentTarget.dataset[FLAG]) {
      e.preventDefault();
      delete e.currentTarget.dataset[FLAG];
    }
  },
  onBlur(e: InputEvent<SelectableInput>) {
    delete e.currentTarget.dataset[FLAG];
  },
};
