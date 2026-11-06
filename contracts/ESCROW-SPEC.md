# HeadroomEscrow spec

Implemented in `contracts/src/HeadroomEscrow.sol`; tests in `contracts/test/HeadroomEscrow.t.sol` (`make escrow-test`); deployed to Arc testnet with `cd signer && ./node_modules/.bin/tsx src/deploy-escrow.ts`, which writes `ARC_ESCROW_ADDRESS` and `ARC_ESCROW_DEPLOY_BLOCK` into `.env`. Per the Arc judges, a CLI deploy to Arc qualifies; Arc Studio is not required.

---

Build `HeadroomEscrow`, a USDC savings-share escrow on Arc testnet for a GPU inference operator and its buyers, implementing exactly the interface below (paste `IHeadroomEscrow.sol`). Target: ETHGlobal Mumbai "Best Smart Contracts with Advanced Stablecoin Logic". Conditional release, dispute window, multi-step settlement, software-to-software payment.

Requirements:
1. USDC via the ERC-20 interface at `0x3600000000000000000000000000000000000000` (6 decimals). Use `transferFrom`/`transfer` only. Never `msg.value`.
2. Constructor: `(address operator, address receiptSigner, address forwarder, uint64 disputeWindow, uint256 challengePenalty)`. For the demo: disputeWindow = 600 (10 min), challengePenalty = 100000 (0.10 USDC). Operator can update `forwarder` and `receiptSigner`.
   Deploy with these values (Arc testnet, generated 2026-11-06 by `signer/src/gen-keys.ts`; keys are in `.env`):
   - `operator` = `0x3F3A94169113A84fd54D257c018c62cFBc30D0EB` (`ARC_OPERATOR_KEY`, funded with 20 USDC)
   - `receiptSigner` = `0x9ED0B08Cf7D36061cA487b540174C75B6BC619d6` (`RECEIPT_SIGNING_KEY`)
   - `forwarder` = `0x76c9cf548b4179F8901cda1f8623568b58215E62` (Chainlink CRE forwarder on `arc-testnet`)
   - `disputeWindow` = `600`, `challengePenalty` = `100000`
3. Accounting per buyer: `free`, `locked`, `deposited`, `withdrawn`, `penaltiesReceived`, `released`. Keep the identity `deposited + penaltiesReceived == released + withdrawn + free + locked` true after every state change; write a test that asserts it after every operation.
4. `postBatch` reverts unless `amount <= baselineAmount`, `amount <= free[buyer]`, `operatorBond >= challengePenalty`. It moves `amount` from free to locked, stores the batch with `windowEnds = block.timestamp + disputeWindow`, emits `BatchPosted`.
5. `release(batchId)`: callable by anyone after `windowEnds`, only from `Open`. Moves locked → `operatorBalance`, increments `released[buyer]`, emits `Released`.
6. `challenge(batchId, batchRecord, proof, receipt, receiptSig)`: only the batch buyer, only before `windowEnds`, only from `Open`.
   - `leaf = keccak256(abi.encode(r.requestId, r.buyer, r.promptTokens, r.cachedTokens, r.completionTokens, r.rIn, r.rCached, r.rOut, r.price, r.timestamp))` (plain `abi.encode` of the struct fields in order, no double hashing). Verify with OpenZeppelin `MerkleProof.verify(proof, batch.root, leaf)` (sorted-pair hashing).
   - Receipt: EIP-712 typed data, domain `{ name: "Headroom", version: "1", chainId, verifyingContract: address(this) }`, type `Receipt(bytes32 requestId,string buyer,uint64 promptTokens,uint64 cachedTokens,uint64 completionTokens,uint64 rIn,uint64 rCached,uint64 rOut,uint64 price,uint64 timestamp)`. Recover the signer and require it equals `receiptSigner`, and `receipt.requestId == batchRecord.requestId`.
   - Mispriced if any of promptTokens, cachedTokens, completionTokens, rIn, rCached, rOut, price differ between `batchRecord` and `receipt`, or if `batchRecord.price != ceil((rIn*(promptTokens-cachedTokens) + rCached*cachedTokens + rOut*completionTokens) / 1e6)` (uint256 math, `cachedTokens <= promptTokens`).
   - On success: batch → `Challenged`; the full batch `amount` moves locked → free (emit `Refunded`), `challengePenalty` moves from `operatorBond` to free[buyer] and `penaltiesReceived[buyer]` (emit `Challenged`). Not mispriced → revert `NotMispriced()`.
7. `registerSessionKey(key, expiry)`: `expiry <= block.timestamp + 7 days`. The gateway checks this mapping off-chain before serving tab requests.
8. `setBaseline(gpuType, usdPerHourE6, timestamp)`: operator only, `timestamp > stored timestamp`, emits `BaselineSet`. `onReport(metadata, report)`: `msg.sender == forwarder`, decode `(string, uint256, uint256)` and apply the same rule. Implement Chainlink's `IReceiver` with `supportsInterface` (ERC-165) so the CRE forwarder can deliver reports.
9. Events exactly as in the interface. Custom errors for every revert.
10. Tests (Foundry, `make escrow-test`):
   - deposit, postBatch, warp past the window, release: balances and `released` correct.
   - postBatch with `amount > baselineAmount` reverts (depth check S5).
   - postBatch above free balance reverts; without bond reverts.
   - challenge with a correct Merkle proof and a mismatching receipt succeeds and refunds amount + penalty; release afterwards reverts.
   - challenge with a correct proof but a consistent receipt and correct formula reverts `NotMispriced`.
   - challenge after the window reverts; release before the window reverts.
   - withdraw more than free reverts; withdraw exact works.
   - setBaseline with an older timestamp reverts; onReport from a non-forwarder reverts.
   - the accounting identity holds after every step.
11. Deploy to Arc testnet (done 2026-11-06: `0xfa7b11252defd7ce61d271f2cbfc8eab7a5acb6f`, links in README).

Artifacts in the repo: source (`contracts/src/`), ABI (`contracts/abi/HeadroomEscrow.json`), deployed address and transaction links (README).
