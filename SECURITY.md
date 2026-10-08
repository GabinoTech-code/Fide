# Security Policy

Fide handles attendance records and payslips of real employees. If you believe you have found a vulnerability, we want
to know, and we will credit you if you wish.

## Reporting a vulnerability

- **Email:** info@fide-work.it, subject starting with `[security]`.
- Please include the affected component (`app/apps/mobile`, `app/apps/web-portal`, `supabase/`, protocol design), steps
  to reproduce or a proof of concept, and the impact as you understand it.
- Please do not access, modify or keep data that is not yours, and do not test against companies other than one you
  registered yourself.
- You will receive an acknowledgement within **72 hours**.

Please use **coordinated disclosure**: give us up to **90 days** to ship a fix before publishing details. We will keep
you informed and agree on a publication date together.

## Scope

In scope:

- Cryptographic design and implementation: punch signatures and server receipts, kiosk QR tokens, end-to-end payslip
  encryption (X25519 + XChaCha20-Poly1305), device key registration.
- Isolation between companies and between employees (Row Level Security, RPCs, Edge Functions, Storage).
- Anything that lets the server, an HR user or another employee read a payslip, forge or alter a punch, learn an
  employee's coordinates, or impersonate an employee or a kiosk.
- The portal at app.fide-work.it and the site at fide-work.it (headers, invitations, sign-in).

Out of scope:

- Denial of service.
- Attacks that need a rooted/jailbroken device or physical access to an unlocked phone.
- Social engineering and phishing of Fide staff or customers.

## Pre-release software

Fide is in a pilot and has **not yet undergone an independent security audit**. The current state of the controls is
in [docs/security/AUDIT-2026-10-07.md](docs/security/AUDIT-2026-10-07.md).
