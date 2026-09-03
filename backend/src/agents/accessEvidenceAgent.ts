import { db } from "../config/firebase";
import { AgentTask, BaseAgent, EvidencePayload } from "./baseAgent";

export class AccessEvidenceAgent extends BaseAgent {
  readonly name = "AccessEvidenceAgent";

  constructor(private userId: string) {
    super();
  }

  protected async collect(_task: AgentTask): Promise<EvidencePayload[]> {
    const recentLogins = await db
      .collection("auditLogs")
      .where("userId", "==", this.userId)
      .where("action", "in", ["auth.login", "auth.login_failed"])
      .orderBy("createdAt", "desc")
      .limit(10)
      .get();

    return [
      {
        evidenceType: "access",
        sourceSystem: "meridian.auth",
        occurredAt: new Date(),
        data: {
          userId: this.userId,
          recentLoginEvents: recentLogins.docs.map((d) => ({ id: d.id, ...d.data() })),
        },
      },
    ];
  }
}
