# Project submission checklist

## Repository details

- Repository: https://github.com/shalomjmeoded/clearday
- Repository/project name: `clearday`; app name: **Do!**
- License: **MIT**, in the root `LICENSE` file. Use the same license in the submission form.
- Stack: TypeScript, React Native, Expo SDK 54, Expo Router, SQLite, Zustand, and RevenueCat.
- Setup and manual verification: [README](../README.md).
- Proposed future work: [roadmap draft](../ROADMAP.md), estimated at 22-30 hours pending maintainer confirmation.

### Description draft

Do! is a task and reminder app for iOS and Android for people who want to organize their day without creating an account. It stores tasks, lists, and settings in a local SQLite database and supports manual backup transfer between devices. It is built with TypeScript, React Native, and Expo, with RevenueCat subscriptions for Pro features.

Adapt this draft into your own words. Add real usage, releases, or deployment links only where you can verify them; this document does not claim any user count, App Store release, or personal usage history.

## Before submitting

- [ ] Commit and push the preparation files to the existing repository so reviewers can see the license, README, roadmap, font notice, and CI workflow.
- [ ] Verify the repository is still public and both CI jobs pass on the submitted commit.
- [ ] Confirm you have permission to license all original contributions and assets. The copyright notice uses the collective name "Do! contributors"; update it if the actual copyright holders require a different attribution.
- [ ] Confirm whether `shalomjmeoded` / Shalom Jonatan Meoded and `vrnrvn` represent multiple contributors, and describe ownership accurately. Do not treat Git authorship alone as proof of ownership.
- [ ] Confirm that the code is personally owned and has no employer, client, university, company, NDA, or other conflicting rights claim. Disclose company or co-ownership where applicable and obtain any required program clarification.
- [ ] Confirm the program's personal-data eligibility rule with the organizers: task content is stored on-device, but the app handles user-entered tasks and RevenueCat/store subscription information. Do not assume local storage automatically satisfies that rule.
- [ ] Confirm that the roadmap reflects work you actually intend to do and that at least 20 hours remain. Estimates in the draft do not establish this on their own.
- [ ] Confirm your contribution emails are linked to your GitHub account. Preserve the existing history; do not squash or re-upload the project as a new repository.
- [ ] Review the submitted files and history for credentials and real user/customer data. Use synthetic examples, and keep `.env`, database files, backups, and signing credentials out of Git. Automated scans are helpful but do not certify the absence of sensitive data.
- [ ] Complete the README's device smoke checks and add accurate release/use evidence if available.

## Keeping the iOS app functional

RevenueCat remains part of the app. Local development reads the public SDK key from the ignored `.env` file; EAS cloud builds need the public SDK key configured in the corresponding EAS environment. The tracked `.env.example` contains no working credentials. Secret/admin keys must never be placed in `EXPO_PUBLIC_*` variables or the app bundle.

Open-source licensing does not remove subscriptions or change the store configuration. See [RevenueCat setup](../REVENUECAT_SETUP.md) for configuration and purchase QA links.

## Audit snapshot

On October 18, 2026, GitHub reported this repository as public and not a fork, with remote `main` at `6b583368b020283bdc35836870cb6b4509816f70`. Preparation changes were still local at that point. Recheck visibility, licensing, CI results, and scans after publishing the preparation commit; the snapshot is not a certification of program eligibility.

Gitleaks 8.30.1 found no secrets in Git history across all locally available refs, or in a separate snapshot of tracked and unignored working files. Ignored local configuration was excluded from the source snapshot. No suppressions or baseline exceptions were used. The scanner is pinned and its archive checksum verified in CI. Repeat the scans for the final submission commit.

Validation passed with the preparation changes: a clean `npm ci` and TypeScript check in an isolated source copy, `npm run check:release`, all 18 Expo Doctor checks, and an iOS JavaScript/Hermes bundle export with local environment loading disabled. These checks do not establish a successful native build, device behavior, working store purchases, or program acceptance. GitHub CI has not run on the local changes yet.

### Dependency follow-up

Preparation included the Expo CLI's recommended SDK 54 patch updates, an explicit Babel preset dependency required by the existing Babel config, and dependency fixes within the declared version ranges. The critical `shell-quote` advisory was resolved by updating that transitive development-tool dependency to 1.12.0.

The last npm audit still reported **46 advisories (21 moderate, 25 high)** across the dependency tree, including Expo/Metro, React Native tooling, and their transitive packages. Some suggested fixes require breaking framework changes. This is not a clean security audit and the counts do not establish exploitability in the shipped app. Review advisory reachability and plan a separately tested framework/dependency upgrade; do not apply `npm audit fix --force` blindly.
