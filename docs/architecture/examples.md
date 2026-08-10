# Worked Example: Cold-chain Response

A warehouse agent protects temperature-sensitive medicine.

```mermaid
sequenceDiagram
  participant P as Perception
  participant An as Analysis
  participant N as Network
  participant D as Decision
  participant Ac as Action
  P->>An: high-temperature observation
  An->>P: request second sensor reading
  P->>An: corroborated readings + door state
  An->>N: request shipment tolerance and technician availability
  N->>D: tolerance plus response options
  D->>N: request supervisor approval
  N->>D: approval received
  D->>Ac: move stock and open maintenance ticket
  Ac->>An: move succeeded; ticket API uncertain
  An->>Ac: retry ticket with idempotency key
  Ac-->>D: completed outcomes
```

1. Perception normalizes a sensor signal; Analysis is needed to determine significance.
2. Analysis finds confidence insufficient and returns to Perception for independent evidence.
3. Analysis confirms risk but lacks policy context, so Network requests information across organizational boundaries.
4. Network provides options to Decision; Decision selects relocation but policy requires human approval, so it goes back through Network.
5. Decision authorizes Action only after approval.
6. Action reports a partial/uncertain outcome to Analysis rather than assuming success.
7. Analysis correlates the timeout with the idempotency contract and proposes another Action; the final outcome returns to Decision to close or revise the goal.

The path is driven by evidence, policy, and outcomes—not by PANDA letter order.
