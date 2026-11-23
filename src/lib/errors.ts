/**
 * An error whose `userMessage` is safe to show to a non-technical user (and to return from the API).
 * `message` may hold more detail for server logs / the CLI; it is never sent to the browser.
 */
export class UserFacingError extends Error {
  constructor(
    /** Stable machine-readable code, e.g. "too_many_images". */
    readonly code: string,
    /** Plain-language message for the user. */
    readonly userMessage: string,
    /** HTTP status the API route should return. */
    readonly status: number,
    /** Optional detail for logs. Defaults to userMessage. */
    detail?: string,
  ) {
    super(detail ?? userMessage);
    this.name = new.target.name;
  }
}
