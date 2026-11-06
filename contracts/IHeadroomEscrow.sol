// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IHeadroomEscrow: savings-share escrow for Headroom tabs (Mode B) on Arc.
/// @notice The repo codes against this interface (signer, reconcile, gateway). The implementation is
///         contracts/src/HeadroomEscrow.sol (Foundry build, CLI deploy to Arc testnet) and implements exactly these
///         functions and events. USDC is the ERC-20 interface at 0x3600000000000000000000000000000000000000
///         on Arc (6 decimals). Never use msg.value: native USDC on Arc has 18 decimals.
interface IHeadroomEscrow {
    // ---------- accounting (per buyer, micro-USDC) ----------
    // free[buyer]   : deposited and not locked by an open batch; withdrawable
    // locked[buyer] : sum of amounts of batches in Open status
    // operatorBalance : released amounts, withdrawable by the operator
    // operatorBond    : penalty pool funded by the operator
    // Identity checked by `make reconcile`, exact in micro-USDC:
    //   deposited + penaltiesReceived == released + withdrawn + free + locked      (per buyer)

    event Deposited(address indexed buyer, uint256 amount);
    event SessionKeyRegistered(address indexed buyer, address indexed key, uint64 expiry);
    event BatchPosted(uint256 indexed batchId, address indexed buyer, bytes32 root, uint32 count, uint64 tokens, uint256 amount, uint256 baselineAmount, uint64 windowEnds);
    event Challenged(uint256 indexed batchId, address indexed buyer, bytes32 leaf, uint256 refund, uint256 penalty);
    event Refunded(uint256 indexed batchId, address indexed buyer, uint256 amount);
    event Released(uint256 indexed batchId, address indexed operator, uint256 amount);
    event Withdrawn(address indexed buyer, uint256 amount);
    event OperatorWithdrawn(address indexed operator, uint256 amount);
    event BondPosted(address indexed operator, uint256 amount);
    event BaselineSet(string gpuType, uint256 usdPerHourE6, uint256 timestamp, address by);

    enum BatchStatus { None, Open, Released, Challenged }

    struct Batch {
        address buyer; bytes32 root; uint32 count; uint64 tokens;
        uint256 amount; uint256 baselineAmount; uint64 windowEnds; BatchStatus status;
    }
    /// One usage record. Leaf = keccak256(abi.encode(requestId, buyer, promptTokens, cachedTokens, completionTokens, rIn, rCached, rOut, price, timestamp)).
    /// `buyer` here is the Hedera-or-EVM buyer id string used off-chain; for tabs it is the buyer's EVM address as a lowercase hex string.
    struct Record {
        bytes32 requestId; string buyer;
        uint64 promptTokens; uint64 cachedTokens; uint64 completionTokens;
        uint64 rIn; uint64 rCached; uint64 rOut;   // micro-USD per 1M tokens
        uint64 price;                              // micro-USDC charged
        uint64 timestamp;
    }

    // ---------- buyer ----------
    function deposit(uint256 amount) external;                                   // pulls USDC (approve first); amount > 0
    function registerSessionKey(address key, uint64 expiry) external;             // expiry <= now + 7 days
    function withdraw(uint256 amount) external;                                  // amount <= free[buyer]
    /// Prove `leaf` (hash of `batchRecord`) is in the batch root AND that it is mispriced:
    /// either the operator-signed receipt (EIP-712 over `receipt`) for the same requestId differs in any token count,
    /// rate or price, or batchRecord.price != ceil((rIn*(prompt-cached) + rCached*cached + rOut*completion)/1e6).
    /// Success: batch -> Challenged, full batch amount unlocked back to free[buyer], plus `challengePenalty` moved from the bond.
    function challenge(uint256 batchId, Record calldata batchRecord, bytes32[] calldata proof, Record calldata receipt, bytes calldata receiptSig) external;

    // ---------- operator ----------
    function postBond(uint256 amount) external;                                   // pulls USDC into the bond
    function postBatch(address buyer, bytes32 root, uint32 count, uint64 tokens, uint256 amount, uint256 baselineAmount) external returns (uint256 batchId);
    // requires: amount <= baselineAmount; amount <= free[buyer]; operatorBond >= challengePenalty; locks amount for `disputeWindow`
    function withdrawOperator(uint256 amount) external;

    // ---------- anyone ----------
    function release(uint256 batchId) external;                                  // windowEnds passed, status Open -> Released, pays operatorBalance

    // ---------- price baseline (Chainlink CRE forwarder or operator) ----------
    function setBaseline(string calldata gpuType, uint256 usdPerHourE6, uint256 timestamp) external;   // operator only; timestamp > stored
    /// Chainlink CRE IReceiver entry: forwarder calls onReport(metadata, report) with report = abi.encode(string gpuType, uint256 usdPerHourE6, uint256 timestamp).
    function onReport(bytes calldata metadata, bytes calldata report) external;

    // ---------- views ----------
    function free(address buyer) external view returns (uint256);
    function locked(address buyer) external view returns (uint256);
    function deposited(address buyer) external view returns (uint256);
    function withdrawn(address buyer) external view returns (uint256);
    function penaltiesReceived(address buyer) external view returns (uint256);
    function released(address buyer) external view returns (uint256);           // released from this buyer's batches
    function batches(uint256 batchId) external view returns (Batch memory);
    function batchCount() external view returns (uint256);
    function sessionKeyExpiry(address buyer, address key) external view returns (uint64);
    function baseline(string calldata gpuType) external view returns (uint256 usdPerHourE6, uint256 timestamp);
    function operator() external view returns (address);
    function receiptSigner() external view returns (address);
    function operatorBond() external view returns (uint256);
    function operatorBalance() external view returns (uint256);
    function disputeWindow() external view returns (uint64);
    function challengePenalty() external view returns (uint256);
    function usdc() external view returns (address);
    function forwarder() external view returns (address);
    function leafOf(Record calldata r) external pure returns (bytes32);
    function receiptDigest(Record calldata r) external view returns (bytes32);  // EIP-712 digest, domain {name:"Headroom", version:"1", chainId, verifyingContract}
}
