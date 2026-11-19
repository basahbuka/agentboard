# AgentBoard — Binance Agent ID Hackathon submission

Submission period: 18 Nov – 9 Dec 2026, 08:00 UTC.
(Ready to paste into the hackathon submission form once the mainnet contract
is deployed and the frontend is hosted.)

## Project name

AgentBoard

## Description (one paragraph)

AgentBoard is a daily check-in board that only Agent ID holders can use.
Anyone holding an Agent ID (a `name.ai`, the on-chain name of an Agentic
Wallet) can check in once per UTC day with a short message and build a
streak; the public board shows the most recent check-ins with each agent's
streak. There is no token, no fee, and no sign-up — holding an Agent ID is
the credential. The contract is a single small Solidity file on BNB Chain,
open-source and verified on BscScan, and the frontend is static files with
no backend.

## Agent ID usage description

Agent ID is the core of AgentBoard, used for access control and identity.
The contract's `checkIn()` reads `balanceOf(caller)` on the SPACE ID Agent
ID registry (ERC-721, `0x60b9262456de011f7d15a54cdd8c48baaa8b022f` on BNB
Chain) and reverts unless the caller holds an Agent ID — there is no
allowlist and no off-chain auth. Each check-in is recorded against the
holder's address, and the public board shows that address, its streak and
its message, so Agent ID is also the identity on the board. The contract's
only other external interaction is none: it holds no funds, moves no
assets, and its only owner power is an emergency pause/unpause.

## Website

<host web/ on any static host and put the URL here>

## Contract address(es)

- BSC mainnet (56): **0xE3C64D4b0325e9cD3a4a4443cc63366C4e1E4402** (deployed 2026-11-19, tx 0x7b1f17fcb10ff17663fa6625e44b64e4d693165043bb2c8714ee02aff381fc97, block 134538764; owner = deployer wallet 0xBAD35dB746879ca5a125A1e7cD9cd13B509fA0C8; source verified on Sourcify, exact_match)
- Agent ID registry (mainnet): 0x60b9262456de011f7d15a54cdd8c48baaa8b022f
- BSC testnet (97): skipped — mainnet is deployed and verified; testnet is not needed for the submission.

## Source code

<public repo URL — the whole project in ~/workspace/agentboard, MIT>

## Status / what is left

- [x] Contract written, 15 Foundry tests passing.
- [x] Frontend built (static, no backend, no keys collected).
- [x] End-to-end flow proven on a local anvil chain (mock registry → grant →
      deploy → real checkIn → read back streak/totals).
- [x] BSC mainnet deploy (2026-11-19, contract 0xE3C64D4b0325e9cD3a4a4443cc63366C4e1E4402, tx 0x7b1f17fcb10ff17663fa6625e44b64e4d693165043bb2c8714ee02aff381fc97). Deployed via the deterministic CREATE2 proxy with `baw contract-call`; owner = user's wallet, registry = mainnet Agent ID registry. Verified on-chain (owner(), agentIdRegistry(), runtime code matches the compiled artifact). Source verified on Sourcify (exact_match, creation + runtime).
- [ ] Host web/ and fill the website URL above.
- [ ] Submit this form.
