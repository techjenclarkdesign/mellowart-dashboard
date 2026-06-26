# MellowArt - Artist Registration Spec

## MellowArt - Artist Registration Tech Architecture

> Excludes financial/Xero integration (already built). Covers data model, screens, states, and logic only.
> 

## 1. Scope boundary — resolved

**In scope (Option B, already purchased):** Application review workflow, payment status tracking UI, stall/event config, filtering + bulk email copy, stall assignment feeding the Xero trigger.

**Out of scope (separate quote, Phase 2):** Per-event dynamic form schema builder (swap/add questions per event). Not urgent per Alison's email.

**Resolution on the billing dispute:** Option B's purchased feature list explicitly includes "1-click approve — automatically triggers Xero invoice via API." That feature is mechanically impossible without a field defining which stall/price was assigned. Alison's own dashboard sketch confirms this: Stall Assigned column feeds directly into the Xero button. Stall assignment is the prerequisite for a feature already paid for — not new scope. The only legitimate separate-quote item is the per-event dynamic form schema.

## 2. Data model

### Event (exists in Webflow CMS)

| Field | Type | Source |
| --- | --- | --- |
| Event name | text | Webflow CMS |
| Slug | text | Webflow CMS |
| Start/End date | date | Webflow CMS |
| Location | text | Webflow CMS |

**New field needed:** `Stall Options` — repeating group, event-scoped (not global).

Stall Option

| Tier | Price (GST incl.) | Frontage / Space | Furniture | Sharing |
| --- | --- | --- | --- | --- |
| Mini – Debut | $200 AUD | 0.9m × 0.75m table | 1 chair | No sharing |
| Standard – Debut | $400 AUD | 2m frontage | 1.8m × 0.75m trestle + 2 chairs | Max 2 brands |
| Flagship – Debut | $520 AUD | 3m frontage | 1.8m × 0.75m trestle + 2 chairs | Max 2 brands |
| Mini | $250 AUD | 0.9m × 0.75m table | 1 chair | No sharing |
| Standard | $450 AUD | 2m frontage | 1.8m × 0.75m trestle + 2 chairs | Max 2 brands |
| Flagship | $570 AUD | 3m frontage | 1.8m × 0.75m trestle + 2 chairs | Max 2 brands |

### Applicant (per submission, per event)

| Field | Type | Notes |
| --- | --- | --- |
| Reference | text, unique | links to detail view |
| Name | text |  |
| Email | text | bulk-copyable |
| Medium / Category | text | currently broken — shows placeholder, not real value |
| Location | text | currently broken — same issue |
| Application Status | enum: Pending / Accepted / Waitlisted / Rejected | independent field |
| Stall Option | FK → StallOption, scoped to applicant's event | only selectable after Accepted |
| Payment Status | enum: Not Sent / Awaiting Payment / Paid / Overdue / Voided | independent field, UI-only here |
| Notes | text, freeform | internal only |
| Submitted At | datetime |  |

**Key fix:** Application Status and Payment Status must be two separate dropdown columns, not one compound badge. Current build conflates them ("Approved · Awaiting payment") — fails 3-second clarity test.

## 3. Status workflow logic

```
Application Status: Pending → Accepted / Waitlisted / Rejected
                     (manual, dropdown, reversible at any time)

Stall Option:        unlocked only when Application Status = Accepted

Payment Status:       Not Sent → Awaiting Payment → Paid
                                                   → Overdue
                                                   → Voided
                      (manual, reversible — Xero action can auto-transition,
                      admin can always override)
```

Color coding (per Alison's request):

- Application Status: Accepted = green, Waitlisted = yellow, Rejected = red, Pending = grey
- Payment Status: Paid = green, Awaiting Payment = yellow, Overdue = red, Voided = grey

## 4. Screens

!image.png

Mellow Art Market - ARTIST APPLY - Detail Pages - 6a223b24e44ab35ad710da4e.csv

### 4.1 Event List (new — currently missing)

List of events from Webflow CMS, each showing applicant count + "X awaiting review." Click → Applicant Table scoped to that event.

→ ui example will be provide from rasya

### 4.2 Applicant Table (rebuild of current "Artist submissions" screen)

Columns: Reference · Name · Email · Medium · Application Status (dropdown) · Stall Option (dropdown, disabled until Accepted) · Payment Status (dropdown) · Notes icon · Actions

Top bar: Search (existing), Filter by Application Status (existing), **new: Filter by Payment Status**, **new: "Copy emails" button** for the filtered set.

Column order should match Alison's sketch: Reference | Name | Email | Application Status | Stall Assigned | Xero button | Payment Status.

### 4.3 Applicant Detail (new)

Full submission content, Notes field, status change history (recommended — prevents the "lost track of numbers" problem from the old spreadsheet flow).

### 4.4 Event Settings → Stall Options (new)

CRUD for stall options per event: label, price, currency.

## 5. Edge cases

| Case | Handling |
| --- | --- |
| Empty state — no applicants yet | "No applications yet" + link to event's live form |
| Loading state | Skeleton rows, not blank screen |
| Event has zero Stall Options configured | Dropdown shows "Configure stall options for this event" link |
| Bulk status change | Out of scope unless requested |
| 500–600 rows per event | Needs pagination or virtualized scroll — untested at that volume currently |

## 6. What Client Need

**Core workflow**

1. View all submissions per event in one place
2. Filter applicants by status (Accepted / Waitlisted / Rejected)
3. Manually change status via dropdown, color-coded (Accepted = green, etc.)
4. Copy email addresses by status group for batch emailing
5. Track stall type + table count per applicant to avoid miscounting
6. Track payment status (Paid / Not Paid), color-coded, manual override allowed
7. Send Xero invoice with correct amount via dashboard, triggered by stall selection — no manual one-by-one invoice creation
8. Flexibility to customize EVENT submission form questions per event (Phase 2, not urgent — confirmed)

**Explicit non-requirements (don't over-build)**

- No heavy automation — small team, comfortable with manual steps
- PROFILE submission (Artist Page) stays simple, unlinked to dashboard — Webflow-only, manual review
- No request for bulk status-change actions
- No request for applicant-facing login/portal

**Confirmed via screenshot (this session)**

- Stall options have real structured detail (frontage, furniture, sharing limit, ticket count) — not just price. Admin will need to see this when assigning, not just a price label.
- Open question still unresolved: whether "Debut" tiers are a separate permanent option set or a discount flag on the regular tiers.

**Volume context**

- Large events: 500–600 applicants. Small events: 200–300.
- Booth types and pricing vary per event.