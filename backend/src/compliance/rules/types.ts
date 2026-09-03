export interface RuleContext {
  transaction: FirebaseFirestore.DocumentData;
  senderAccount: FirebaseFirestore.DocumentData | null;
  history: FirebaseFirestore.DocumentData[]; // sender's recent transactions, most recent first
  customer: FirebaseFirestore.DocumentData | null;
  kyc: FirebaseFirestore.DocumentData | null;
  config: {
    largeTransactionThreshold: number;
    highRiskLocations: string[];
  };
}

export interface RuleResult {
  ruleCode: string;
  ruleName: string;
  triggered: boolean;
  score: number; // contribution to the 0-100 risk score, already weighted
  reason: string;
  /** True when there wasn't enough history/data to evaluate confidently — maps to NEEDS_REVIEW, never an automatic FAIL. */
  insufficientData?: boolean;
}

export type RuleFn = (ctx: RuleContext) => RuleResult;
