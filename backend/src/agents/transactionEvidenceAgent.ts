import { db } from "../config/firebase";
import { AgentTask, BaseAgent, EvidencePayload } from "./baseAgent";

export class TransactionEvidenceAgent extends BaseAgent {
  readonly name = "TransactionEvidenceAgent";

  constructor(private transactionId: string) {
    super();
  }

  protected async collect(_task: AgentTask): Promise<EvidencePayload[]> {
    const txSnap = await db.collection("transactions").doc(this.transactionId).get();
    if (!txSnap.exists) return [];
    const tx = txSnap.data()!;

    const [senderAccountSnap, historySnap] = await Promise.all([
      db.collection("accounts").doc(tx.senderAccountId).get(),
      db
        .collection("transactions")
        .where("senderAccountId", "==", tx.senderAccountId)
        .orderBy("createdAt", "desc")
        .limit(20)
        .get(),
    ]);

    const history = historySnap.docs
      .filter((d) => d.id !== this.transactionId)
      .map((d) => ({ id: d.id, ...d.data() }));

    return [
      {
        evidenceType: "transaction",
        sourceSystem: "meridian.transactions",
        relatedTransactionId: this.transactionId,
        relatedCustomerId: tx.senderCustomerId ?? null,
        occurredAt: tx.createdAt ?? new Date(),
        data: {
          transaction: { id: this.transactionId, ...tx },
          senderAccount: senderAccountSnap.exists ? senderAccountSnap.data() : null,
          recentHistoryCount: history.length,
          recentHistory: history.slice(0, 10),
        },
      },
    ];
  }
}
