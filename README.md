# AgentBoard

A daily check-in board that **only Agent ID holders can use** — built for the
Binance Agent ID Hackathon (submission period 18 Nov – 9 Dec 2026).

Agent ID is the on-chain name of an Agentic Wallet (`name.ai`), issued as a
non-transferable ERC-721 by SPACE ID on BNB Chain. AgentBoard uses it for
**access control and identity**: the smart contract only lets an address check
in if that address holds an Agent ID, and every check-in is tied to the
holder's address, with a streak that grows on consecutive UTC days.

## Contract

- **Deployed (BSC mainnet, chain 56):** `0xE3C64D4b0325e9cD3a4a4443cc63366C4e1E4402`
  (deployed 2026-11-19, tx `0x7b1f17fcb10ff17663fa6625e44b64e4d693165043bb2c8714ee02aff381fc97`,
  block 134538764; owner = `0xBAD35dB746879ca5a125A1e7cD9cd13B509fA0C8`; source
  verified on Sourcify, exact_match).
- **Source:** `contracts/AgentBoard.sol` (Solidity ^0.8.20, OpenZeppelin
  Ownable + Pausable, no proxy, no token, no fees, no asset transfers).
- **Agent ID registry (mainnet):** `0x60b9262456de011f7d15a54cdd8c48baaa8b022f`
  (SPACE ID Agent ID, ERC-721). The registry address is an immutable set in
  the constructor, so testnet can use a mock.
- **How Agent ID is used:** `checkIn()` reads `balanceOf(caller)` on the
  registry and reverts unless it is > 0. That is the only external call.
  No allowlist, no sign-up — holding an Agent ID *is* the credential.
- **What a check-in does:** one per address per UTC day (`block.timestamp /
  86400`), message max 280 bytes. It records the check-in (day, message,
  timestamp), updates the caller's streak (consecutive UTC days; a gap resets
  it to 1), the caller's lifetime total, and the global totals. It emits
  `CheckedIn(address indexed agent, uint256 indexed day, uint256 streak,
  string message)`.
- **Views:** `streakOf`, `totalCheckIns`, `lastCheckInDay`,
  `hasCheckedInToday`, `checkInOf(address, day)`, `totalCheckInsGlobal`,
  `totalAgents`.
- **Owner powers — pause/unpause ONLY.** The deployer is the owner, and the
  only owner functions are `pause()` / `unpause()` (emergency stop of
  check-ins). There is no mint, no withdraw, no fee setter, no upgrade, and
  no other admin function. The contract holds no funds and moves no assets.
  This is stated in the contract's NatSpec and in this README.

### Addresses

| Network | AgentBoard | Agent ID registry |
| --- | --- | --- |
| BSC mainnet (56) | _to be deployed_ | `0x60b9262456de011f7d15a54cdd8c48baaa8b022f` |
| BSC testnet (97) | _pending test BNB for the faucet_ | mock (to be deployed) |

## Tests

Foundry (15 tests, all passing):

```bash
FOUNDRY_PROFILE=lite forge test --jobs 1
```

Covers: non-holder reverts, revoked holder reverts, holder checks in,
second check-in same day reverts, streak increments on consecutive days,
streak resets after a gap, `streakOf` is 0 once broken, 280-byte message cap,
empty message allowed, pause blocks check-ins and unpause restores them,
only the owner can pause, view functions, past-day lookups, registry
immutability, owner is the deployer.

## Frontend

Static files in `web/` — no build step, no backend, no libraries, no CDN.
Open `web/index.html` from any static host (or `python3 -m http.server`
inside `web/`).

- Connects via the injected wallet (`window.ethereum` — MetaMask / Binance
  Wallet). **No QR-code login, no seed/private-key/API-secret collection,
  and no bypassing the user's transaction confirmation** — every check-in is
  a normal transaction the user confirms in their own wallet.
- Reads the connected address's Agent ID balance; if 0, it shows how to claim
  an Agent ID in the Binance App (Wallet > Agent ID) and disables the form.
- Check-in form (max 280 chars) + the user's streak, totals, today's status
  and the global totals.
- Public board: the most recent `CheckedIn` events, read with `eth_getLogs`
  from the public BSC RPC, newest first.
- The frontend makes no request to any other server besides the chain RPC.
  Fill in `boardAddress` (and `deployBlock`) in `web/app.js` after deployment.

## Deploy

```bash
# BSC testnet (chain 97) with a mock registry:
AGENT_ID_REGISTRY=<mock-registry> PRIVATE_KEY=<throwaway-testnet-key> \
  forge script script/Deploy.s.sol \
  --rpc-url https://bsc-testnet-dataseed.bnbchain.org --broadcast
```

The script prints the deployed address and the exact BscScan verification
command. Use environment variables for the RPC URL and the deployer key —
**never hardcode a key, and never use a real/mainnet key here.**

Verify on BscScan (testnet explorer: testnet.bscscan.com; mainnet: bscscan.com):

```bash
forge verify-contract --chain <97|56> <address> contracts/AgentBoard.sol:AgentBoard \
  --constructor-args $(cast abi-encode 'constructor(address)' <registry-address>)
```

## Hackathon submission fields

- **Project name:** AgentBoard
- **Website:** _host `web/` on any static host and put the URL here_
- **Contract address(es):** _mainnet address once deployed_
- **Agent ID usage description:** AgentBoard's core is Agent ID: the contract
  gates every check-in on `balanceOf(caller) > 0` on the SPACE ID Agent ID
  registry, so only Agent ID holders can check in, and each check-in is
  publicly tied to the holder's address (identity + streaks). No allowlist,
  no off-chain auth — holding an Agent ID is the credential.

See `SUBMISSION.md` for the exact submission text.

## End-to-end proof (local anvil)

The full flow was proven on a local anvil chain (same EVM, same deploy
script): mock registry deployed, Agent ID granted, AgentBoard deployed,
a real `checkIn` sent and read back (streak 1, totals 1). The live BSC
testnet deploy is pending test BNB — the faucets (QuickNode, Chainstack)
require a browser wallet connection, which this build environment cannot do;
see `SUBMISSION.md` for the exact unblock step.
