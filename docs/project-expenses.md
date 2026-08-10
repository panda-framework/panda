# PANDA Project Expenses

**Status:** Active cost baseline

**Last updated:** August 10, 2026

**Currency:** United States dollars (USD)

## 1. Purpose

This document records PANDA's current operating expenses, identifies costs that
may appear as the project grows, and defines a lightweight process for reviewing
and approving spend. It is a planning baseline, not an accounting statement or
a commitment to purchase any of the potential services listed below.

The current operating model is intentionally local-first. PANDA applications
run on developer-owned machines, the public project site is hosted with GitHub
Pages, and no paid application server or cloud instance is required.

## 2. Current expense summary

| Category | Service or resource | Billing cycle | Monthly cost | Annualized cost | Notes |
| --- | --- | --- | ---: | ---: | --- |
| Development tooling | Code Pro plan | Monthly | $200 | $2,400 | Primary paid development tool. Confirm the exact account owner and renewal date in the private billing record. |
| Social presence | Twitter/X badge | Monthly | $8 | $96 | Verification/subscription expense for the project's social account. |
| Static website hosting | GitHub Pages | No paid plan | $0 | $0 | Hosts the public static project website. |
| PANDA application compute | Local developer machines | No project hosting bill | $0 | $0 | All PANDA application processes currently run locally; there are no paid server instances. |
| **Total known recurring expense** |  |  | **$208** | **$2,496** | Excludes taxes, foreign-exchange fees, and any unapproved future services. |

### Baseline interpretation

- The known recurring cash requirement is **$208 per month**, or **$2,496 per
  year** if both subscriptions remain active for 12 months at their current
  prices.
- GitHub Pages provides the current website hosting at no project cost.
- PANDA does not currently incur application-server, container-hosting,
  managed-database, object-storage, or production bandwidth charges.
- Developer hardware, electricity, internet access, and personal workspace are
  treated as contributed resources and are not included in the cash total.
- Taxes and payment-card or currency-conversion fees are excluded because they
  depend on the billing account and location.

## 3. Current infrastructure cost model

### Public website

The project homepage is a static site served by GitHub Pages. The present site
does not require a paid web server, load balancer, database, or content delivery
network subscription.

GitHub Pages should remain the default while the public site is static. A paid
hosting decision is warranted only if the site begins to require server-side
execution, private services, higher operational guarantees, or capabilities
that cannot be delivered as static files.

### PANDA applications

The CLI, daemon, dashboard, packages, and examples are developed and run on
local machines. This keeps the current project infrastructure bill at zero and
avoids maintaining always-on PANDA instances.

Local execution does not mean the software can never create third-party costs.
A developer may configure a model provider, external API, hosted data service,
or remote connector. Those costs should be treated as optional usage expenses
and should not be represented as part of the shared PANDA baseline until the
project approves and funds them.

## 4. Potential future expenses

The following items are not part of the current **$208 monthly baseline**. They
are planning categories to review before the project adopts a service or moves
a workload away from the local-first model.

| Potential category | Current budget | When it may become necessary | Primary cost driver |
| --- | ---: | --- | --- |
| Custom domain and DNS | $0 / not approved | A branded domain is selected for the project site or APIs | Registration, renewal, privacy, and premium-DNS fees |
| GitHub plan, Actions, or artifact storage | $0 / not approved | Repository usage exceeds included allowances or requires paid organization features | Seats, CI minutes, runner type, storage, and retention |
| Remote application hosting | $0 / not approved | PANDA needs an always-on public daemon, dashboard, demo, or managed deployment | Instance size, runtime hours, bandwidth, regions, and redundancy |
| Managed database and backups | $0 / not approved | Persistent shared sessions, goals, traces, or accounts move beyond local storage | Data volume, compute, replicas, backup retention, and egress |
| Object storage and content delivery | $0 / not approved | The project stores large artifacts, models, media, or public downloads | Stored volume, requests, transfer, and retention |
| Model and external API usage | $0 / not approved | PANDA runs paid language, vision, search, mapping, messaging, or other APIs | Requests, tokens, generated media, rate limits, and data transfer |
| Monitoring and incident tooling | $0 / not approved | A hosted service needs shared logs, traces, uptime checks, alerts, or error reporting | Events, data ingestion, retention, seats, and alert volume |
| Email and notifications | $0 / not approved | The project sends account, operational, community, or release messages | Contacts, message volume, deliverability features, and dedicated IPs |
| Security services | $0 / not approved | Releases or hosted workloads require advanced scanning, audits, secrets management, or penetration testing | Repository count, seats, scan volume, and professional services |
| Code signing and distribution | $0 / not approved | PANDA distributes signed desktop/mobile binaries or publishes through an app store | Developer programs, certificates, signing infrastructure, and store fees |
| Legal, accounting, and insurance | $0 / not approved | The project forms an entity, accepts material funding, hires contributors, or assumes commercial obligations | Filing fees, professional time, jurisdiction, and coverage |
| Design, media, and marketing | $0 / not approved | The project commissions brand work, paid assets, campaigns, events, or community tools | Licenses, contractor time, ad spend, and event fees |
| Payment and donation processing | $0 fixed budget | The project processes contributions or paid services through a third party | Transaction percentage, fixed per-transaction charges, and settlement fees |
| Contributor equipment and connectivity | Contributed / not reimbursed | The project begins purchasing or reimbursing hardware, internet, test devices, or workspace | Equipment, replacement cycle, shipping, power, and connectivity |

Listing a category does not authorize the expense. Any proposed purchase should
include the service, owner, business need, expected monthly and annual cost,
cancellation terms, data handled, and a lower-cost alternative.

## 5. Cost triggers and controls

Use these triggers to keep infrastructure decisions deliberate:

| Trigger | Required review |
| --- | --- |
| A free service begins requiring a payment method | Record the owner, limits, renewal terms, and maximum exposure before enabling billing. |
| A workload moves from a local machine to a hosted environment | Estimate compute, storage, bandwidth, backup, monitoring, and security costs together. |
| A usage-priced API is enabled | Set a project-level spending cap and alerts; document behavior when the cap is reached. |
| A trial or promotional price is used | Record its expiration date and the normal renewal price. |
| A subscription duplicates an existing capability | Compare consolidation, downgrade, and cancellation options before renewal. |
| A service stores project or user data | Review security, retention, export, deletion, and vendor-lock-in implications alongside price. |
| Monthly recurring cost changes | Update this document and the private billing record in the same review cycle. |

Recommended controls:

1. Keep paid subscriptions assigned to a named owner and a project purpose.
2. Store invoices, renewal dates, account identifiers, and payment details in a
   private financial record, never in this public repository.
3. Enable provider budgets and usage alerts wherever metered billing is
   possible.
4. Prefer reversible monthly commitments while requirements and usage are
   uncertain.
5. Require explicit approval before enabling production resources, paid API
   access, annual contracts, or automatic scaling.
6. Remove unused resources promptly and confirm that cancellation stops future
   billing without deleting data that must be retained.

## 6. Monthly review checklist

Review expenses once per month and before every new paid commitment:

- Verify the Code Pro plan and Twitter/X badge charges against their invoices.
- Confirm GitHub Pages remains free for the project's current use.
- Confirm there are still no paid PANDA hosting instances or managed data
  services.
- Review API dashboards for unexpected usage or balances, even when the
  expected cost is zero.
- Check upcoming renewals, trial expirations, price changes, and unused seats.
- Update monthly and annualized totals when a price or subscription changes.
- Record newly approved services and remove cancelled services from the current
  expense table.

## 7. Updating this record

When an expense changes, update the current-expense table, the total, the
last-updated date, and any affected assumptions. Use the project's documented
[GitHub Pull Request Workflow](github-push-workflow.md) so cost changes are
reviewable and auditable.

Do not commit invoices, card details, billing addresses, tax identifiers,
account recovery information, access tokens, or other private financial data.
This document should contain only the public budget summary needed to explain
and govern project spending.
