# Do! roadmap draft

These are proposed improvements based on the current implementation, not completed work or a confirmed maintainer commitment. Confirm priorities and estimates before using this roadmap in a project submission. Estimates include implementation, verification, and documentation.

| Priority | Work | Estimate | Acceptance criteria |
| --- | --- | --- | --- |
| 1 | Strengthen backup validation and restore recovery | 6-8 hours | Validate task/list fields and references before replacement; reject malformed or unsupported files with clear errors; verify failed restores preserve existing data; cover successful round trips with synthetic fixtures. |
| 2 | Verify recurrence and reminder behavior | 6-8 hours | Add deterministic coverage for overdue recurring tasks, month ends, leap years, and daylight-saving boundaries; verify reminder rescheduling and notification permission denial on devices; document expected behavior. |
| 3 | Improve subscription failure recovery | 5-7 hours | Verify missing configuration, unavailable offerings, cancellation, offline status, restore, and app-resume refresh; add focused tests at the subscription service boundary and document device QA results. |
| 4 | Verify database upgrades and persistence | 5-7 hours | Exercise new-install and existing-schema migrations with synthetic data; confirm tasks, lists, and settings survive upgrades; document recovery behavior and add regression coverage. |

Total proposed work: **22-30 hours**, subject to maintainer review. Reproduce problems before changing behavior; each item should produce focused regression coverage and updated documentation.

## Scope

Prioritize reliable local task storage and the existing native app. Cloud sync and an Expo SDK upgrade need separate scope and estimates. Use synthetic data for tests, screenshots, and shared backups.

## Dependency maintenance follow-up

The submission preparation audit identified unresolved advisories in the SDK 54 / React Native dependency tree after compatible fixes. Triage which advisories affect development tooling versus shipped app behavior, then scope and test the necessary framework upgrades. See the [audit snapshot](docs/project-submission.md#dependency-follow-up). This additional maintenance work is not included in the estimates above.
