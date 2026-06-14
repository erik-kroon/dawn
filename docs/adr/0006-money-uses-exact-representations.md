# 0006: Money Uses Exact Representations

Status: Accepted
Date: 2026-06-14

## Context

Dawn will categorize transactions, report totals, invoice customers, reconcile payments, and eventually handle exchange rates. JavaScript floating point arithmetic can silently corrupt authoritative financial calculations.

## Decision

Authoritative money values must use exact representations. Store currency codes and integer minor units where a currency has a stable minor unit. Use exact decimal strings for values that require arbitrary precision, exchange rates, provider decimals, or calculations that cannot be represented safely as minor units.

Domain money utilities must own parsing, formatting, arithmetic, rounding policy, currency validation, and conversion metadata. UI may format money for display but must not perform authoritative calculations with `number` floats.

## Consequences

- Database schema should encode currency alongside amounts.
- API contracts should avoid ambiguous floating point amounts for financial writes.
- Reporting and invoice totals require explicit rounding rules.
- Provider adapters must normalize provider amount formats into canonical money values while preserving raw payloads where useful.

## Alternatives Considered

- JavaScript numbers: convenient but unsafe for financial authority.
- Store all amounts as strings only: precise but awkward for constraints, sorting, and aggregation.
- Store all amounts as minor-unit integers only: good for many currencies, but insufficient for exchange rates and provider decimal edge cases.
