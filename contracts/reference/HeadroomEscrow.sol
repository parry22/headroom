// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IHeadroomEscrow} from "../IHeadroomEscrow.sol";

/// Reference implementation of IHeadroomEscrow, written in this repo to rehearse the tab pipeline
/// (signer, settle-demo, reconcile) on Arc testnet before the Arc Studio build exists.
/// It is NOT the submission contract: track rule S1 requires the contract to be created and tested in
/// Arc Studio from contracts/STUDIO-PROMPT.md. When the Studio contract is deployed, point
/// ARC_ESCROW_ADDRESS at it; nothing else in the repo changes because both implement the same interface.

interface IERC20Min {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// Chainlink CRE consumer entry point (ERC-165 discoverable).
interface IReceiver {
    function onReport(bytes calldata metadata, bytes calldata report) external;
}

contract HeadroomEscrow is IHeadroomEscrow {
    error ZeroAmount();
    error NotOperator();
    error NotForwarder();
    error NotBuyer();
    error ExpiryTooFar();
    error InsufficientFree();
    error InsufficientOperatorBalance();
    error AboveBaseline();
    error BondTooLow();
    error NotOpen();
    error WindowOpen();
    error WindowClosed();
    error BadProof();
    error BadReceiptSigner();
    error RequestIdMismatch();
    error NotMispriced();
    error StaleBaseline();
    error TransferFailed();
    error ZeroAddress();

    address public constant USDC = 0x3600000000000000000000000000000000000000;
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant RECEIPT_TYPEHASH = keccak256(
        "Receipt(bytes32 requestId,string buyer,uint64 promptTokens,uint64 cachedTokens,uint64 completionTokens,uint64 rIn,uint64 rCached,uint64 rOut,uint64 price,uint64 timestamp)"
    );
    uint256 private constant HALF_N = 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0;

    address public immutable operator;
    uint64 public immutable disputeWindow;
    uint256 public immutable challengePenalty;
    address public receiptSigner;
    address public forwarder;

    mapping(address => uint256) public free;
    mapping(address => uint256) public locked;
    mapping(address => uint256) public deposited;
    mapping(address => uint256) public withdrawn;
    mapping(address => uint256) public penaltiesReceived;
    mapping(address => uint256) public released;
    mapping(address => mapping(address => uint64)) public sessionKeyExpiry;
    uint256 public operatorBond;
    uint256 public operatorBalance;
    uint256 public batchCount;

    mapping(uint256 => Batch) private _batches;
    struct Baseline { uint256 usdPerHourE6; uint256 timestamp; }
    mapping(string => Baseline) private _baselines;

    constructor(address operator_, address receiptSigner_, address forwarder_, uint64 disputeWindow_, uint256 challengePenalty_) {
        if (operator_ == address(0) || receiptSigner_ == address(0)) revert ZeroAddress();
        operator = operator_;
        receiptSigner = receiptSigner_;
        forwarder = forwarder_;
        disputeWindow = disputeWindow_;
        challengePenalty = challengePenalty_;
    }

    modifier onlyOperator() {
        if (msg.sender != operator) revert NotOperator();
        _;
    }

    // ---------- buyer ----------
    function deposit(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        _pull(msg.sender, amount);
        deposited[msg.sender] += amount;
        free[msg.sender] += amount;
        emit Deposited(msg.sender, amount);
    }

    function registerSessionKey(address key, uint64 expiry) external {
        if (expiry > block.timestamp + 7 days) revert ExpiryTooFar();
        sessionKeyExpiry[msg.sender][key] = expiry;
        emit SessionKeyRegistered(msg.sender, key, expiry);
    }

    function withdraw(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        if (amount > free[msg.sender]) revert InsufficientFree();
        free[msg.sender] -= amount;
        withdrawn[msg.sender] += amount;
        _push(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    function challenge(uint256 batchId, Record calldata batchRecord, bytes32[] calldata proof, Record calldata receipt, bytes calldata receiptSig)
        external
    {
        Batch storage b = _batches[batchId];
        if (b.status != BatchStatus.Open) revert NotOpen();
        if (msg.sender != b.buyer) revert NotBuyer();
        if (block.timestamp >= b.windowEnds) revert WindowClosed();

        bytes32 leaf = leafOf(batchRecord);
        if (!_verify(proof, b.root, leaf)) revert BadProof();
        if (receipt.requestId != batchRecord.requestId) revert RequestIdMismatch();
        if (_recover(receiptDigest(receipt), receiptSig) != receiptSigner) revert BadReceiptSigner();
        if (!_mispriced(batchRecord, receipt)) revert NotMispriced();

        address buyer = b.buyer;
        uint256 amount = b.amount;
        b.status = BatchStatus.Challenged;
        locked[buyer] -= amount;
        free[buyer] += amount;
        emit Refunded(batchId, buyer, amount);

        uint256 penalty = challengePenalty <= operatorBond ? challengePenalty : operatorBond;
        operatorBond -= penalty;
        free[buyer] += penalty;
        penaltiesReceived[buyer] += penalty;
        emit Challenged(batchId, buyer, leaf, amount, penalty);
    }

    // ---------- operator ----------
    function postBond(uint256 amount) external onlyOperator {
        if (amount == 0) revert ZeroAmount();
        _pull(msg.sender, amount);
        operatorBond += amount;
        emit BondPosted(msg.sender, amount);
    }

    function postBatch(address buyer, bytes32 root, uint32 count, uint64 tokens, uint256 amount, uint256 baselineAmount)
        external
        onlyOperator
        returns (uint256 batchId)
    {
        if (amount > baselineAmount) revert AboveBaseline();
        if (amount > free[buyer]) revert InsufficientFree();
        if (operatorBond < challengePenalty) revert BondTooLow();
        free[buyer] -= amount;
        locked[buyer] += amount;
        batchId = batchCount++;
        uint64 windowEnds = uint64(block.timestamp) + disputeWindow;
        _batches[batchId] = Batch(buyer, root, count, tokens, amount, baselineAmount, windowEnds, BatchStatus.Open);
        emit BatchPosted(batchId, buyer, root, count, tokens, amount, baselineAmount, windowEnds);
    }

    function withdrawOperator(uint256 amount) external onlyOperator {
        if (amount > operatorBalance) revert InsufficientOperatorBalance();
        operatorBalance -= amount;
        _push(msg.sender, amount);
        emit OperatorWithdrawn(msg.sender, amount);
    }

    function setReceiptSigner(address s) external onlyOperator {
        if (s == address(0)) revert ZeroAddress();
        receiptSigner = s;
    }

    function setForwarder(address f) external onlyOperator {
        forwarder = f;
    }

    // ---------- anyone ----------
    function release(uint256 batchId) external {
        Batch storage b = _batches[batchId];
        if (b.status != BatchStatus.Open) revert NotOpen();
        if (block.timestamp < b.windowEnds) revert WindowOpen();
        b.status = BatchStatus.Released;
        locked[b.buyer] -= b.amount;
        released[b.buyer] += b.amount;
        operatorBalance += b.amount;
        emit Released(batchId, operator, b.amount);
    }

    // ---------- price baseline ----------
    function setBaseline(string calldata gpuType, uint256 usdPerHourE6, uint256 timestamp) external onlyOperator {
        _setBaseline(gpuType, usdPerHourE6, timestamp);
    }

    function onReport(bytes calldata, bytes calldata report) external {
        if (msg.sender != forwarder) revert NotForwarder();
        (string memory gpuType, uint256 usdPerHourE6, uint256 timestamp) = abi.decode(report, (string, uint256, uint256));
        _setBaseline(gpuType, usdPerHourE6, timestamp);
    }

    function supportsInterface(bytes4 id) external pure returns (bool) {
        return id == type(IReceiver).interfaceId || id == 0x01ffc9a7;
    }

    // ---------- views ----------
    function batches(uint256 batchId) external view returns (Batch memory) {
        return _batches[batchId];
    }

    function baseline(string calldata gpuType) external view returns (uint256 usdPerHourE6, uint256 timestamp) {
        Baseline storage bl = _baselines[gpuType];
        return (bl.usdPerHourE6, bl.timestamp);
    }

    function usdc() external pure returns (address) {
        return USDC;
    }

    function leafOf(Record calldata r) public pure returns (bytes32) {
        return keccak256(abi.encode(r.requestId, r.buyer, r.promptTokens, r.cachedTokens, r.completionTokens, r.rIn, r.rCached, r.rOut, r.price, r.timestamp));
    }

    function receiptDigest(Record calldata r) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                RECEIPT_TYPEHASH, r.requestId, keccak256(bytes(r.buyer)), r.promptTokens, r.cachedTokens, r.completionTokens,
                r.rIn, r.rCached, r.rOut, r.price, r.timestamp
            )
        );
        bytes32 domainSeparator =
            keccak256(abi.encode(DOMAIN_TYPEHASH, keccak256("Headroom"), keccak256("1"), block.chainid, address(this)));
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    }

    // ---------- internals ----------
    function _setBaseline(string memory gpuType, uint256 usdPerHourE6, uint256 timestamp) internal {
        Baseline storage bl = _baselines[gpuType];
        if (timestamp <= bl.timestamp) revert StaleBaseline();
        bl.usdPerHourE6 = usdPerHourE6;
        bl.timestamp = timestamp;
        emit BaselineSet(gpuType, usdPerHourE6, timestamp, msg.sender);
    }

    function _mispriced(Record calldata a, Record calldata r) internal pure returns (bool) {
        if (
            a.promptTokens != r.promptTokens || a.cachedTokens != r.cachedTokens || a.completionTokens != r.completionTokens
                || a.rIn != r.rIn || a.rCached != r.rCached || a.rOut != r.rOut || a.price != r.price
        ) return true;
        if (a.cachedTokens > a.promptTokens) return true;
        uint256 num = uint256(a.rIn) * (a.promptTokens - a.cachedTokens) + uint256(a.rCached) * a.cachedTokens
            + uint256(a.rOut) * a.completionTokens;
        return a.price != (num + 999_999) / 1_000_000;
    }

    function _verify(bytes32[] calldata proof, bytes32 root, bytes32 leaf) internal pure returns (bool) {
        bytes32 h = leaf;
        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 p = proof[i];
            h = h < p ? keccak256(abi.encodePacked(h, p)) : keccak256(abi.encodePacked(p, h));
        }
        return h == root;
    }

    function _recover(bytes32 digest, bytes calldata sig) internal pure returns (address) {
        if (sig.length != 65) return address(0);
        bytes32 r = bytes32(sig[0:32]);
        bytes32 s = bytes32(sig[32:64]);
        uint8 v = uint8(sig[64]);
        if (v < 27) v += 27;
        if (uint256(s) > HALF_N || (v != 27 && v != 28)) return address(0);
        return ecrecover(digest, v, r, s);
    }

    function _pull(address from, uint256 amount) internal {
        if (!IERC20Min(USDC).transferFrom(from, address(this), amount)) revert TransferFailed();
    }

    function _push(address to, uint256 amount) internal {
        if (!IERC20Min(USDC).transfer(to, amount)) revert TransferFailed();
    }
}
