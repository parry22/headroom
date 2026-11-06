// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {HeadroomEscrow} from "../reference/HeadroomEscrow.sol";
import {IHeadroomEscrow} from "../IHeadroomEscrow.sol";

/// Foundry cheatcodes, declared here so the tests need no forge-std install (offline build).
interface Vm {
    function warp(uint256) external;
    function prank(address) external;
    function startPrank(address) external;
    function stopPrank() external;
    function expectRevert(bytes4) external;
    function etch(address, bytes calldata) external;
    function addr(uint256) external returns (address);
    function sign(uint256, bytes32) external returns (uint8, bytes32, bytes32);
}

contract MockUSDC {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 a) external { balanceOf[to] += a; }
    function approve(address s, uint256 a) external returns (bool) { allowance[msg.sender][s] = a; return true; }
    function transfer(address to, uint256 a) external returns (bool) {
        balanceOf[msg.sender] -= a; balanceOf[to] += a; return true;
    }
    function transferFrom(address f, address to, uint256 a) external returns (bool) {
        allowance[f][msg.sender] -= a; balanceOf[f] -= a; balanceOf[to] += a; return true;
    }
}

contract HeadroomEscrowTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address constant USDC = 0x3600000000000000000000000000000000000000;
    uint256 constant SIGNER_PK = 0xA11CE;
    uint64 constant WINDOW = 600;
    uint256 constant PENALTY = 100_000;

    HeadroomEscrow esc;
    MockUSDC usdc;
    address op = address(0x0FE);
    address buyer = address(0xB0B);
    address fwd = address(0xF0D);

    function setUp() public {
        vm.etch(USDC, address(new MockUSDC()).code);
        usdc = MockUSDC(USDC);
        esc = new HeadroomEscrow(op, vm.addr(SIGNER_PK), fwd, WINDOW, PENALTY);
        usdc.mint(op, 10_000_000);
        usdc.mint(buyer, 10_000_000);
        vm.prank(op); usdc.approve(address(esc), type(uint256).max);
        vm.prank(buyer); usdc.approve(address(esc), type(uint256).max);
        vm.prank(op); esc.postBond(2 * PENALTY);
        vm.prank(buyer); esc.deposit(2_000_000);
        _identity();
    }

    // ---------- helpers ----------
    function _eq(uint256 a, uint256 b, string memory what) internal pure {
        require(a == b, what);
    }

    function _identity() internal view {
        _eq(esc.deposited(buyer) + esc.penaltiesReceived(buyer),
            esc.released(buyer) + esc.withdrawn(buyer) + esc.free(buyer) + esc.locked(buyer), "identity");
    }

    function _rec(bytes32 id, uint64 price) internal pure returns (IHeadroomEscrow.Record memory r) {
        // rIn 150000, rCached 37500, rOut 600000 micro-USD/1M; prompt 1000 (cached 400), completion 50
        // honest price = ceil((150000*600 + 37500*400 + 600000*50)/1e6) = ceil(135000000/1e6) = 135
        r = IHeadroomEscrow.Record(id, "0x0000000000000000000000000000000000000b0b", 1000, 400, 50, 150_000, 37_500, 600_000, price, 1_700_000_000);
    }

    function _pair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a < b ? keccak256(abi.encodePacked(a, b)) : keccak256(abi.encodePacked(b, a));
    }

    function _sig(IHeadroomEscrow.Record memory r) internal returns (bytes memory) {
        (uint8 v, bytes32 rr, bytes32 s) = vm.sign(SIGNER_PK, esc.receiptDigest(r));
        return abi.encodePacked(rr, s, v);
    }

    /// Two-leaf batch: leaf0 = `a`, leaf1 = `b`. Returns batch id.
    function _post(IHeadroomEscrow.Record memory a, IHeadroomEscrow.Record memory b, uint256 baselineAmount) internal returns (uint256) {
        bytes32 root = _pair(esc.leafOf(a), esc.leafOf(b));
        vm.prank(op);
        return esc.postBatch(buyer, root, 2, 2100, a.price + b.price, baselineAmount);
    }

    // ---------- tests ----------
    function test_lifecycle_release() public {
        uint256 id = _post(_rec(bytes32("r1"), 135), _rec(bytes32("r2"), 135), 1000);
        _eq(esc.locked(buyer), 270, "locked");
        _identity();
        vm.expectRevert(HeadroomEscrow.WindowOpen.selector);
        esc.release(id);
        vm.warp(block.timestamp + WINDOW);
        esc.release(id);
        _eq(esc.released(buyer), 270, "released");
        _eq(esc.operatorBalance(), 270, "opBalance");
        _eq(esc.locked(buyer), 0, "unlocked");
        _identity();
        vm.prank(op); esc.withdrawOperator(270);
        _eq(usdc.balanceOf(op), 10_000_000 - 2 * PENALTY + 270, "op paid");
    }

    function test_S5_postBatch_above_baseline_reverts() public {
        IHeadroomEscrow.Record memory a = _rec(bytes32("r1"), 135);
        bytes32 leaf = esc.leafOf(a);
        vm.prank(op);
        vm.expectRevert(HeadroomEscrow.AboveBaseline.selector);
        esc.postBatch(buyer, leaf, 1, 1050, 136, 135);
    }

    function test_postBatch_above_free_reverts() public {
        vm.prank(op);
        vm.expectRevert(HeadroomEscrow.InsufficientFree.selector);
        esc.postBatch(buyer, bytes32(0), 1, 1, 2_000_001, 3_000_000);
    }

    function test_postBatch_without_bond_reverts() public {
        HeadroomEscrow e2 = new HeadroomEscrow(op, vm.addr(SIGNER_PK), fwd, WINDOW, PENALTY);
        vm.prank(buyer); usdc.approve(address(e2), 1000);
        vm.prank(buyer); e2.deposit(1000);
        vm.prank(op);
        vm.expectRevert(HeadroomEscrow.BondTooLow.selector);
        e2.postBatch(buyer, bytes32(0), 1, 1, 10, 10);
    }

    function test_challenge_mispriced_refunds_amount_and_penalty() public {
        IHeadroomEscrow.Record memory honest = _rec(bytes32("r1"), 135);
        IHeadroomEscrow.Record memory wrong = _rec(bytes32("r1"), 406); // price * 3 + 1
        IHeadroomEscrow.Record memory other = _rec(bytes32("r2"), 135);
        uint256 id = _post(wrong, other, 1000);
        uint256 freeBefore = esc.free(buyer);
        bytes32[] memory proof = new bytes32[](1);
        proof[0] = esc.leafOf(other);
        bytes memory sig = _sig(honest);
        vm.prank(buyer);
        esc.challenge(id, wrong, proof, honest, sig);
        _eq(esc.free(buyer), freeBefore + 406 + 135 + PENALTY, "refund + penalty");
        _eq(esc.penaltiesReceived(buyer), PENALTY, "penalty");
        _eq(esc.operatorBond(), PENALTY, "bond");
        _identity();
        vm.warp(block.timestamp + WINDOW);
        vm.expectRevert(HeadroomEscrow.NotOpen.selector);
        esc.release(id);
    }

    function test_challenge_formula_only_mismatch() public {
        // receipt and record agree but the price breaks the formula
        IHeadroomEscrow.Record memory bad = _rec(bytes32("r1"), 200);
        IHeadroomEscrow.Record memory other = _rec(bytes32("r2"), 135);
        uint256 id = _post(bad, other, 1000);
        bytes32[] memory proof = new bytes32[](1);
        proof[0] = esc.leafOf(other);
        bytes memory sig = _sig(bad);
        vm.prank(buyer);
        esc.challenge(id, bad, proof, bad, sig);
        _identity();
    }

    function test_challenge_consistent_reverts_NotMispriced() public {
        IHeadroomEscrow.Record memory a = _rec(bytes32("r1"), 135);
        IHeadroomEscrow.Record memory b = _rec(bytes32("r2"), 135);
        uint256 id = _post(a, b, 1000);
        bytes32[] memory proof = new bytes32[](1);
        proof[0] = esc.leafOf(b);
        bytes memory sig = _sig(a);
        vm.prank(buyer);
        vm.expectRevert(HeadroomEscrow.NotMispriced.selector);
        esc.challenge(id, a, proof, a, sig);
    }

    function test_challenge_bad_signer_reverts() public {
        IHeadroomEscrow.Record memory wrong = _rec(bytes32("r1"), 406);
        IHeadroomEscrow.Record memory other = _rec(bytes32("r2"), 135);
        uint256 id = _post(wrong, other, 1000);
        IHeadroomEscrow.Record memory honest = _rec(bytes32("r1"), 135);
        (uint8 v, bytes32 rr, bytes32 s) = vm.sign(0xBAD, esc.receiptDigest(honest));
        bytes32[] memory proof = new bytes32[](1);
        proof[0] = esc.leafOf(other);
        vm.prank(buyer);
        vm.expectRevert(HeadroomEscrow.BadReceiptSigner.selector);
        esc.challenge(id, wrong, proof, honest, abi.encodePacked(rr, s, v));
    }

    function test_challenge_after_window_reverts() public {
        IHeadroomEscrow.Record memory wrong = _rec(bytes32("r1"), 406);
        IHeadroomEscrow.Record memory other = _rec(bytes32("r2"), 135);
        uint256 id = _post(wrong, other, 1000);
        IHeadroomEscrow.Record memory honest = _rec(bytes32("r1"), 135);
        bytes memory sig = _sig(honest);
        bytes32[] memory proof = new bytes32[](1);
        proof[0] = esc.leafOf(other);
        vm.warp(block.timestamp + WINDOW);
        vm.prank(buyer);
        vm.expectRevert(HeadroomEscrow.WindowClosed.selector);
        esc.challenge(id, wrong, proof, honest, sig);
    }

    function test_withdraw_limits() public {
        vm.prank(buyer);
        vm.expectRevert(HeadroomEscrow.InsufficientFree.selector);
        esc.withdraw(2_000_001);
        vm.prank(buyer);
        esc.withdraw(2_000_000);
        _eq(esc.free(buyer), 0, "free");
        _identity();
    }

    function test_session_key_expiry_cap() public {
        vm.prank(buyer);
        vm.expectRevert(HeadroomEscrow.ExpiryTooFar.selector);
        esc.registerSessionKey(address(0x5E), uint64(block.timestamp + 8 days));
        vm.prank(buyer);
        esc.registerSessionKey(address(0x5E), uint64(block.timestamp + 1 days));
        _eq(esc.sessionKeyExpiry(buyer, address(0x5E)), block.timestamp + 1 days, "expiry");
    }

    function test_baseline_rules() public {
        vm.prank(op); esc.setBaseline("H200", 3_500_000, 100);
        vm.prank(op);
        vm.expectRevert(HeadroomEscrow.StaleBaseline.selector);
        esc.setBaseline("H200", 3_400_000, 100);
        vm.expectRevert(HeadroomEscrow.NotForwarder.selector);
        esc.onReport("", abi.encode("H200", uint256(3_600_000), uint256(200)));
        vm.prank(fwd);
        esc.onReport("", abi.encode("H200", uint256(3_600_000), uint256(200)));
        (uint256 p, uint256 t) = esc.baseline("H200");
        _eq(p, 3_600_000, "price"); _eq(t, 200, "ts");
        require(esc.supportsInterface(0x805f2132) || esc.supportsInterface(HeadroomEscrow.onReport.selector), "IReceiver");
    }
}
