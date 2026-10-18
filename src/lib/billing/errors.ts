/** A billing failure safe to show to the person checking out. Never put a secret in the message. */
export class BillingError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 | 502 | 503 = 400,
  ) {
    super(message);
  }
}
