# Fide — Project Rules

The full rules live in `CLAUDE.md` at the repository root (in Spanish). The short version for any coding agent:

## Git Workflow
- **Never push directly to `main`**. Always create a branch first.
- Branch naming: `feat/<name>`, `fix/<name>`, `chore/<name>`, `docs/<name>`, `refactor/<name>`.
- After committing and pushing the branch, open the PR and give the owner its link. The owner decides when it merges.
- PR link format: `https://github.com/GabinoTech-code/Fide/compare/main...<branch-name>`

## Non-negotiables
- Payslips are encrypted in the HR browser and decrypted only on the employee's phone; no server code sees them in clear.
- Private keys never leave the phone. No biometric data. Location is only "inside/outside", never coordinates.
- Punches are signed and append-only; corrections are approved requests.
- Every change is complete end to end: migration + RLS + db-tests, portal, app, the 9 languages, docs (legal docs too
  when data processing changes).
- A changed behaviour updates its canonical doc in the same PR, or the PR body says `Docs: none — <reason>`.
