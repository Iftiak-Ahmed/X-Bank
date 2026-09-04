export class InsufficientBalanceError extends Error {
  constructor(message = "Insufficient balance.") {
    super(message);
    this.name = "InsufficientBalanceError";
  }
}

export class TransactionRuleBlockedError extends Error {
  constructor(public ruleName: string, public reason: string) {
    super(`Blocked by transaction rule "${ruleName}": ${reason}`);
    this.name = "TransactionRuleBlockedError";
  }
}
