/* An error whose message is safe to show to the user, with the HTTP status to send. */
export class AiError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}
