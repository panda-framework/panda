# Capability Contracts

Capability implementations are independently registered and replaceable. They accept typed inputs plus narrow ports for state, policy, connectors, persistence, and telemetry. They return products and a proposed next step; they do not call another concrete capability.

| Capability | Accepts | Produces | Does not own |
| --- | --- | --- | --- |
| Perception | `Signal`, source configuration, context | `Observation` or `PerceptionFailure` | transport drivers, global state, decisions |
| Analysis | observations, selected state snapshots, goals, context | `Assessment`, prediction, information need, options | final intent selection, external effects |
| Network | outbound message/request or inbound envelope | delivery/receipt outcome and normalized received information | domain interpretation, internal runtime routing |
| Decision | assessments, observations, goals, state snapshots, policies, available capabilities | `Decision` containing an intent/next step | performing effects |
| Action | authorized intent and action connector | `Outcome` | deciding whether the intent was desirable |

Minimum products carry stable identity, occurrence time, correlation and causation, typed content, provenance/evidence where relevant, and schema version. Confidence expresses uncertainty, not trust; trust and validation status are separate.

Analysis answers “what is happening, what might happen, and what information/options exist?” Decision answers “what should this system do next under its goals and constraints?” Planning can contribute options to either, but selection belongs to Decision.

Network is invoked when exchange itself is autonomy work: addressing a participant, discovering a capability, requesting or distributing information/work, or coordinating across an ownership/trust boundary. The runtime event bus that dispatches local work is infrastructure and is not the Network capability.
