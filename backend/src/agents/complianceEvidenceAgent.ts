import { AgentTask, BaseAgent, EvidencePayload } from "./baseAgent";
import { RuleResult } from "../compliance/rules/types";

export class ComplianceEvidenceAgent extends BaseAgent {
  readonly name = "ComplianceEvidenceAgent";

  constructor(
    private transactionId: string,
    private customerId: string | null,
    private triggeredRules: RuleResult[]
  ) {
    super();
  }

  protected async collect(_task: AgentTask): Promise<EvidencePayload[]> {
    if (this.triggeredRules.length === 0) return [];
    return [
      {
        evidenceType: "compliance",
        sourceSystem: "meridian.compliance-engine",
        relatedTransactionId: this.transactionId,
        relatedCustomerId: this.customerId,
        occurredAt: new Date(),
        data: {
          triggeredRules: this.triggeredRules,
        },
      },
    ];
  }
}
