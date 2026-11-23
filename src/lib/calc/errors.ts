/** Thrown for invalid calculator input. Messages are plain language, safe to show users. */
export class CalcError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalcError";
  }
}
