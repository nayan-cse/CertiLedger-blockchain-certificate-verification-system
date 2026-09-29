# CertiLedger - Assignment 2

A blockchain academic certificate DApp with university and student registration, approved issuers, immutable certificate hashes, public verification, QR codes, printable certificates, revocation and an administrator dashboard.

## Run on your computer

1. Install **Node.js 24 LTS** from <https://nodejs.org/>. Node 22 or later is required; evaluation used Node 24.19.0.
2. Extract the complete ZIP. Open the `CertiLedger_Assignment_2` folder containing `package.json`.
3. On Windows, click the File Explorer address bar, type `cmd`, and press Enter. On macOS/Linux, open a terminal in that folder.
4. Run these commands, one at a time:

   ```sh
   npm ci
   npm start
   ```

5. Wait for `CertiLedger ready at http://localhost:3000`, then open <http://localhost:3000> in Chrome, Edge or Firefox. Keep the terminal open.

The startup command compiles Solidity, starts a persistent local EVM on port 8545, deploys or reuses the contract, and serves the DApp on port 3000. No Docker, database installation, XAMPP, paid account or browser wallet is needed. Dependencies need internet access for the first installation; normal local use works offline.

Stop with **Ctrl+C**. Next time, run `npm start`. Preserve the complete `data/` directory: it contains the local blockchain, deployment metadata and delivered certificate files. The ZIP intentionally excludes runtime data and `node_modules`.

## Fast demonstration

Keep `npm start` running. Open a second terminal in the project folder:

```sh
npm run demo
```

This registers University A and Student A if needed, approves University A, issues one live synthetic certificate and writes:

- `data/demo/certificate-valid.json`
- `data/demo/certificate-tampered.json`

Upload the first in **Verify certificate**: the result is authentic. Upload the second: the changed qualification is detected. Open **Certificate registry**, select **University A**, choose **Revoke**, enter a reason and confirm. Verify the original again: it is revoked. The demo command creates a new certificate each time; it may reapprove University A if you suspended it.

The files in `evidence/` are historical results from isolated test chains. They are not preloaded into your new local chain. Use `npm run demo` to create samples for your own running instance.

## Manual demonstration of every required feature

| Step | Account | Action |
|---|---|---|
| 1 | University A | Registration > University; enter a fictional university name and register. |
| 2 | Student A | Registration > Student; enter `DEMO-2026-001` and register. Keep the downloaded registration receipt if needed. |
| 3 | Administrator | Administration > Approve the university. |
| 4 | University A | Issue certificate; use Student A's wallet, fictional name, student number, qualification, classification and issue date. |
| 5 | University A | Keep the downloaded certificate JSON; open the printable certificate and its QR code. Print / save as PDF if desired. |
| 6 | Employer / public verifier | Verify certificate > upload the original JSON. Verification needs no wallet or transaction fee. |
| 7 | Employer / public verifier | Change the qualification in a copy of the JSON, save and verify it; the altered copy fails. |
| 8 | Administrator | Suspend the university; its existing certificates are flagged and new issuance is blocked. Reapprove it for the next step. |
| 9 | University A | Certificate registry > Revoke; enter a reason. This cannot be undone. |
| 10 | Employer / public verifier | Verify the original again; it is revoked. |
| 11 | Administrator | Review event history, university approval and certificate/student totals. |

University B and Student B are available for a second independent issuer/recipient. An account has one role; the administrator is reserved. Another university, a student, or the administrator cannot revoke University A's certificates.

## QR codes and printable documents

The QR contains `/verify?id=...&chain=31337&registry=...` on the configured verifier origin. The app fetches the committed original, recomputes SHA-256 and checks current chain state. A copied QR alone does not prove the surrounding paper is authentic: compare all displayed fields with the paper, or verify the JSON file.

Default QR URLs use `http://localhost:3000`. Open them on the computer running the project. **A phone's localhost is the phone itself**, so scanning on a different device will not reach this local demo. A multi-device deployment needs a trusted reachable HTTPS verifier and a production-safe RPC/wallet configuration. `PUBLIC_BASE_URL` changes the QR origin for such an adapted deployment; it does not publish this app or open its loopback listeners.

## Verification directly against RPC

The CLI checks the certificate without using the delivery store or verification HTTP endpoint:

```sh
npm run verify -- data/demo/certificate-valid.json
```

By default it trusts the contract address in your own `data/deployment.json` and RPC `http://127.0.0.1:8545`. A different trusted registry can be selected explicitly:

```sh
npm run verify -- certificate.json --rpc http://127.0.0.1:8545 --registry 0xYOUR_TRUSTED_REGISTRY --chain 31337
```

Replace the placeholder with an actual address. Obtain the registry address from a trusted source, not from an untrusted certificate alone. Exit code 0 means valid; 2 means a non-valid certificate status; connection or input errors exit nonzero. Verification is a state snapshot at the reported block, not a guarantee about future revocation.

## Reproduce the evaluation

These commands start their own isolated chains; your running app need not be open, and they do not change its `data/` directory:

```sh
npm test
npm run benchmark
```

Or run syntax checks, all tests and the full benchmark with captured evidence:

```sh
npm run evaluate
```

The full benchmark takes several minutes. It performs 30 measured issuance/verification cycles after 2 warmups, then 3 repetitions of each workload: 10, 50 and 100 certificates at concurrency 4, plus 100 certificates at concurrency 1 and 8. Each workload uses a fresh chain. It records deployment cost, all transaction receipts, gas/fees, full issuance latency, verification latency, first-block confirmation wait, TPS and success rate. Volume and concurrency are varied separately.

Results overwrite `evidence/benchmark-results.json`, `transactions.csv`, `scalability.csv`, sample QR/documents and `demonstration.json`. `npm run evaluate` also writes test logs and a summary. The supplied PDF records the supplied run; regenerating measurements does not automatically update it. See `tools/README.md` for the report generator.

## Architecture and files

| Path | Purpose |
|---|---|
| `contracts/AcademicRegistry.sol` | Registration, approval, hash commitments, public verification and permanent revocation. |
| `lib/credential.mjs` | Shared strict certificate schema, canonical UTF-8 JSON, SHA-256 and QR URL format. |
| `lib/verify.mjs` | Snapshot verification against the trusted chain and registry. |
| `lib/runtime.mjs` | Ganache setup, compilation, deployment, persistence and graceful shutdown. |
| `lib/server.mjs` | Loopback Express server, controlled RPC proxy, certificate delivery, QR SVG and read-only dashboard. |
| `public/` | Responsive interface and printable certificate view. |
| `scripts/start.mjs` | Starts the complete project. |
| `scripts/demo.mjs` | Creates a live synthetic demonstration and altered comparison file. |
| `scripts/verify.mjs` | Direct RPC verification independent of the app's delivery store. |
| `scripts/benchmark.mjs` | Reproducible metrics with actual receipts and repeated workloads. |
| `tests/system.test.mjs` | Functional, authorization, tamper, API and persistence checks. |
| `artifacts/AcademicRegistry.json` | Compiled ABI, bytecode, compiler/settings and source hash. |
| `docs/` | Requirement coverage, design notes, viva guide and final report. |
| `evidence/` | Actual evaluation output; historical samples, not live seed data. |

Transactions are enforced by Solidity, not by button visibility. The document store is an off-chain delivery convenience: only exact already-committed documents can be published. A certificate ID and hash cannot be overwritten. Verification uses one blockchain block snapshot. There are no token payments, NFTs, external contract calls or transfer-of-certificate ownership.

## Important design limits

- Synthetic local demonstration only. Ganache's deterministic wallets are unlocked and publicly predictable. The selector intentionally represents different users on one computer. Never expose the RPC or use these accounts with real funds/data.
- The contract records which approved wallet committed the certificate. Accreditation, actual student identity and the truth of the award need institutional checks. Names are self-declared until an administrator vets the university.
- Off-chain JSON contains names and qualifications and is openly downloadable by ID. IDs are not access control. Chain addresses, hashes, university names and relationships are public. Student number commitments use random salts in the UI; the explicit seed demo uses a disclosed synthetic salt.
- The EVM and file store run on one host; the local experiment is not a distributed production network. Backups and multiple independently operated nodes are future work.
- Revocation flags future verification; it cannot delete downloaded files. Suspended issuers can still revoke their own certificates. Reapproval does not restore a revoked certificate.
- Delivery can fail after a successful transaction. Preserve the pre-downloaded JSON and use the recovery form to republish it. If both the delivery copy and original JSON are lost, the blockchain hash cannot reconstruct the document.
- Read calls have zero transaction fee but still consume server resources. A verification result is only as current as its reported block. Public-chain finality, reorg handling and provider trust require deployment-specific policies.
- Registry pages show 25 certificates at a time. The admin event query scans historical logs and displays the latest 100; a production indexer would be needed at large scale.
- Automated verification covers contracts, live HTTP/RPC workflows, QR output and persistence. Browser interactions, MetaMask integration, print rendering and phone-camera scanning need a manual check on your computer; no browser automation was performed in the supplied evaluation.

## Troubleshooting

**`npm` is not recognized:** install Node.js, close the terminal, open a new one and run `node --version` and `npm --version`.

**PowerShell blocks `npm.ps1`:** open Command Prompt (`cmd`) or use `npm.cmd ci` / `npm.cmd start`; no execution-policy change is needed.

**EPERM / EBUSY during installation on Windows:** stop this project's running terminal with Ctrl+C and close programs holding its `node_modules`. If still locked, restart Windows. Then, from the project folder in Command Prompt, delete only its dependency folder and reinstall:

```bat
rmdir /s /q node_modules
npm ci
```

Do not delete `data` or `package-lock.json`. Extract into a short writable path such as `C:\Projects\CertiLedger` if path length is an issue. Do not run two installs in the same folder.

**`EBADPLATFORM` mentions `fsevents`:** the supplied lock avoids a mandatory entry for Ganache's bundled macOS-only watcher. If you regenerated the lock, run `node scripts/fix-lock.mjs`, then `npm ci`.

**Ganache prints a µWS compatibility warning:** its JavaScript fallback is expected with Node 24 and was used for the supplied measurements. Wait for the ready message; this warning alone does not mean startup failed.

**Port already in use:** stop the earlier project process. Advanced settings are `PORT` for HTTP and `RPC_PORT` for the chain. Keep both consistent with your browser/CLI configuration.

**Contract source changed:** the runtime refuses to reuse an incompatible deployment. Keep old data intact and choose a new `DATA_DIR` for a fresh chain, or restore matching source. Back up the whole stopped `data/` folder before experimenting.

**Browser wallet (optional):** configure chain 31337, currency ETH, RPC `http://127.0.0.1:8545`; connect using the button. Use the built-in demo selector for the easiest workflow. External wallets need local test ETH and must register their own address; importing a predictable demo key is not suitable for real networks.