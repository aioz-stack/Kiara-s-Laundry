/** A problem to show the user as is: a broken business rule or failed lookup. */
export class DomainError extends Error {}

export class ForbiddenError extends DomainError {
  constructor() {
    super("You do not have permission to do that.");
  }
}

export class NotFoundError extends DomainError {
  constructor(what: string) {
    super(`${what} was not found.`);
  }
}
