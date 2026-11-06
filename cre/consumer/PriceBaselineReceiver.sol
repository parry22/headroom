// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/*//////////////////////////////////////////////////////////////////////////
                         Headroom — PriceBaselineReceiver
//////////////////////////////////////////////////////////////////////////

Minimal, self-contained consumer for the Chainlink CRE `price-baseline` workflow.
Reference for the CRE receiver logic; contracts/src/HeadroomEscrow.sol implements the same onReport rule:
no external imports, no proxy, no OpenZeppelin.

Data flow (see https://docs.chain.link/cre/guides/workflow/using-evm-client/onchain-write/building-consumer-contracts):

  CRE DON  --signed report-->  KeystoneForwarder  --onReport(metadata, report)-->  this contract

Report ABI (one report per GPU type, produced by cre/price-baseline/main.ts):

  abi.encode(string gpuType, uint256 usdPerHourE6, uint256 timestamp)

  gpuType       "H100" | "H200" (free-form string, keyed by keccak256 in storage)
  usdPerHourE6  median on-demand $/hr * 1e6   (e.g. 2.6900 $/hr -> 2690000)
  timestamp     cron scheduledExecutionTime (unix seconds). Must be strictly greater
                than the last accepted timestamp for that gpuType; this is the
                replay guard recommended by the CRE docs ("same-chain replay on failure").

Forwarders on Arc Testnet (chain selector name "arc-testnet"):
  production KeystoneForwarder  0x76c9cf548b4179F8901cda1f8623568b58215E62
  simulation MockForwarder      0x6E9EE680ef59ef64Aa8C7371279c27E496b5eDc1
Deploy with the one you need, or switch later with setForwarder().

`metadata` layout (informational, not validated here): abi.encodePacked(
  bytes32 workflowId, bytes10 workflowName, address workflowOwner) = 62 bytes,
delivered as a 64-byte slice by the production forwarder (last 2 bytes = reportId).
The MockForwarder used by `cre workflow simulate` passes empty metadata, so this
contract deliberately does NOT require a metadata length. Add workflowId/owner
checks here once the workflow is deployed and its id is known.

//////////////////////////////////////////////////////////////////////////*/

/// @dev ERC-165 (https://eips.ethereum.org/EIPS/eip-165). The KeystoneForwarder
///      queries this before delivering a report.
interface IERC165 {
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}

/// @dev Chainlink keystone receiver interface. Copied verbatim from
///      chainlink/contracts keystone/interfaces/IReceiver.sol.
interface IReceiver is IERC165 {
    /// @notice Handles incoming keystone reports.
    /// @dev If this function call reverts, it can be retried with a higher gas
    /// limit. The receiver is responsible for discarding stale reports.
    /// @param metadata Report's metadata.
    /// @param report Workflow report.
    function onReport(bytes calldata metadata, bytes calldata report) external;
}

contract PriceBaselineReceiver is IReceiver {
    // ------------------------------------------------------------------ types
    struct Baseline {
        uint256 usdPerHourE6; // median on-demand price, USD * 1e6 per GPU-hour
        uint256 timestamp;    // unix seconds of the cron slot that produced it
    }

    // ---------------------------------------------------------------- storage
    /// @notice Owner: may rotate the forwarder, transfer ownership, and use the
    ///         operator relay path (setBaseline).
    address public owner;

    /// @notice Only this address may call onReport (the Chainlink KeystoneForwarder).
    address public forwarder;

    /// @dev keccak256(bytes(gpuType)) => latest accepted baseline.
    mapping(bytes32 => Baseline) private s_baselines;

    // ----------------------------------------------------------------- events
    /// @notice Emitted on every accepted update, from either the DON path or the
    ///         owner relay path.
    event BaselineSet(string gpuType, uint256 usdPerHourE6, uint256 timestamp);
    event ForwarderUpdated(address indexed previousForwarder, address indexed newForwarder);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // ----------------------------------------------------------------- errors
    error NotOwner(address caller);
    error NotForwarder(address caller, address expected);
    error ZeroAddress();
    error ZeroPrice(string gpuType);
    error StaleReport(string gpuType, uint256 reportTimestamp, uint256 lastAccepted);

    // -------------------------------------------------------------- modifiers
    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner(msg.sender);
        _;
    }

    // ------------------------------------------------------------ constructor
    /// @param _forwarder KeystoneForwarder (prod) or MockForwarder (simulation) address.
    constructor(address _forwarder) {
        if (_forwarder == address(0)) revert ZeroAddress();
        owner = msg.sender;
        forwarder = _forwarder;
        emit OwnershipTransferred(address(0), msg.sender);
        emit ForwarderUpdated(address(0), _forwarder);
    }

    // ------------------------------------------------------------- DON path
    /// @inheritdoc IReceiver
    /// @dev `metadata` is intentionally unused (see header). Reverting here is safe:
    ///      the forwarder does not mark a reverted report as used, so a later
    ///      successful run simply supersedes it.
    function onReport(bytes calldata metadata, bytes calldata report) external override {
        metadata; // silence unused-parameter warning
        if (msg.sender != forwarder) revert NotForwarder(msg.sender, forwarder);

        (string memory gpuType, uint256 usdPerHourE6, uint256 timestamp) =
            abi.decode(report, (string, uint256, uint256));

        _setBaseline(gpuType, usdPerHourE6, timestamp);
    }

    // -------------------------------------------------------- operator relay
    /// @notice Owner-only fallback so a Headroom operator can relay a baseline when
    ///         the DON path is unavailable (e.g. before the workflow is deployed).
    ///         Subject to the same monotonic-timestamp rule as the DON path, so the
    ///         two paths cannot overwrite each other with older data.
    function setBaseline(string calldata gpuType, uint256 usdPerHourE6, uint256 timestamp) external onlyOwner {
        _setBaseline(gpuType, usdPerHourE6, timestamp);
    }

    // ------------------------------------------------------------------ admin
    /// @notice Rotate the trusted forwarder (e.g. MockForwarder -> KeystoneForwarder).
    function setForwarder(address _forwarder) external onlyOwner {
        if (_forwarder == address(0)) revert ZeroAddress();
        emit ForwarderUpdated(forwarder, _forwarder);
        forwarder = _forwarder;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // ------------------------------------------------------------------ views
    /// @notice Latest accepted baseline for a GPU type ("H100", "H200").
    /// @return usdPerHourE6 USD * 1e6 per GPU-hour (0 if never set)
    /// @return timestamp    unix seconds of the producing cron slot (0 if never set)
    function getBaseline(string calldata gpuType) external view returns (uint256 usdPerHourE6, uint256 timestamp) {
        Baseline storage b = s_baselines[keccak256(bytes(gpuType))];
        return (b.usdPerHourE6, b.timestamp);
    }

    /// @inheritdoc IERC165
    function supportsInterface(bytes4 interfaceId) public pure override returns (bool) {
        return interfaceId == type(IReceiver).interfaceId || interfaceId == type(IERC165).interfaceId;
    }

    // --------------------------------------------------------------- internal
    function _setBaseline(string memory gpuType, uint256 usdPerHourE6, uint256 timestamp) internal {
        if (usdPerHourE6 == 0) revert ZeroPrice(gpuType);

        bytes32 key = keccak256(bytes(gpuType));
        Baseline storage b = s_baselines[key];

        // Monotonic guard: rejects replays of older signed reports and out-of-order relays.
        if (timestamp <= b.timestamp) revert StaleReport(gpuType, timestamp, b.timestamp);

        b.usdPerHourE6 = usdPerHourE6;
        b.timestamp = timestamp;

        emit BaselineSet(gpuType, usdPerHourE6, timestamp);
    }
}
