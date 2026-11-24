// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ReentrancyGuard, SafeTransfer} from "./lib/SafeTransfer.sol";
import {IERC20Min, IPoolManager, PoolKey, SwapParams} from "./interfaces/External.sol";

/// Where the launchpad keeps a creator's trading fees until they are claimed.
interface IFeeEscrow {
    function balanceOf(address) external view returns (uint256);
    function balanceOfToken(address, address) external view returns (uint256);
    function claim() external;
    function claimToken(address) external;
}

/// The launchpad's factory: the current fee recipient may name the next one.
interface ILaunchFees {
    function transferCreatorFeeRecipient(address token, address to) external;
}

/**
 * Proof Burn. This contract is the recipient of the $CORBEL creator's trading fees and splits them itself:
 *
 *  - collect(), which anyone may call, claims the fees waiting in the launchpad's escrow. BASE_BPS of what came in stays
 *    here for the burn and the rest goes to the team in the same call.
 *  - burn(record) spends that share, at most once an hour: ETH buys $CORBEL in the one pool fixed at deployment, inside a
 *    price bound, and every coin goes straight to the dead address. It needs a record: the Merkle root of the token
 *    checks sealed so far, written in the same transaction. No record, no burn. A recorded root can never be changed.
 *  - While a penalty runs, PENALTY_BPS of the fees stay for the burn instead. Penalties never add up past that.
 *      wrong(): a check that called a token clean, proven to be in a root recorded at least MIN_AGE earlier, whose token
 *               was then drained. The public log decides which; each verdict counts once.
 *      late():  a promise made here with a date that has passed undelivered. Anyone may call it, once a day per promise,
 *               for up to LATE_DAYS days. A promise's date can never be moved.
 *
 * There is no owner, no withdraw and no way to change the shares, the pool, the team address or the keeper. What is set
 * aside can only leave as burned $CORBEL. The keeper can time a burn and name a wrong check or a promise; it can never
 * take anything. If the keeper goes silent for SILENT, anyone may burn what is set aside against the last record.
 *
 * It runs for TERM. After that anyone may call finish(), which hands the fee stream back to the team through the
 * launchpad's own function; what was set aside before stays here and still can only be burned. Until then nobody can
 * point the fees elsewhere: the launchpad takes that call only from the current recipient, and finish() is the only
 * function here that makes it. The launchpad's own admin is outside this contract; a change by it would be visible on chain.
 */
contract CorbelProofBurn is ReentrancyGuard {
    using SafeTransfer for address;

    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;
    uint256 public constant BASE_BPS = 1_000; // 10%
    uint256 public constant PENALTY_BPS = 2_000; // 20%, the most there is
    uint256 public constant PENALTY = 1 days;
    uint256 public constant LATE_DAYS = 7;
    uint256 public constant MIN_AGE = 1 hours; // a verdict must have been sealed before its outcome could be known
    uint256 public constant EVERY = 1 hours;
    uint256 public constant SILENT = 7 days; // after this without a burn, anyone may run it
    uint256 public constant TERM = 30 days;
    uint160 internal constant MIN_SQRT = 4295128740;

    IPoolManager public immutable pm;
    IFeeEscrow public immutable escrow;
    ILaunchFees public immutable factory;
    address public immutable corbel;
    uint256 public immutable ends;
    address public immutable team;
    address public immutable keeper;
    uint16 public immutable maxImpactBps;
    PoolKey internal pool;

    bool public finished;
    uint256 public budget; // ETH set aside for the next burns
    uint256 public lastBurn;
    uint256 public penaltyUntil;
    uint256 public burns;
    uint256 public totalEth;
    uint256 public totalBurned;
    bytes32 public lastRecord;

    mapping(bytes32 => uint256) public recordedAt; // root → when it was written
    mapping(bytes32 => bool) public counted; // verdict leaf → already counted as wrong

    struct Promise_ {
        uint64 due;
        uint64 delivered;
        uint64 lastLate;
        uint8 lates;
    }

    mapping(bytes32 => Promise_) public promises;

    event Collected(uint256 ethIn, uint256 kept, uint256 toTeam, uint256 bps);
    event Burned(uint256 indexed n, bytes32 indexed record, uint256 ethIn, uint256 corbelOut);
    event Recorded(bytes32 indexed record);
    event Wrong(bytes32 indexed leaf, bytes32 indexed record, string verdict, uint256 until);
    event Promised(bytes32 indexed id, string what, uint64 due);
    event Delivered(bytes32 indexed id, string proof);
    event Finished(address indexed to);
    event Late(bytes32 indexed id, uint8 day, uint256 until);

    uint256 internal _spend;
    uint160 internal _limit;

    modifier onlyKeeper() {
        require(msg.sender == keeper, "keeper");
        _;
    }

    constructor(IPoolManager pm_, IFeeEscrow escrow_, ILaunchFees factory_, address corbel_, PoolKey memory pool_, address team_, address keeper_, uint16 maxImpactBps_) {
        require(pool_.currency0 == address(0) && pool_.currency1 == corbel_, "pool must be ETH/CORBEL");
        require(maxImpactBps_ > 0 && maxImpactBps_ <= 500, "impact");
        require(team_ != address(0) && keeper_ != address(0), "zero");
        pm = pm_;
        escrow = escrow_;
        factory = factory_;
        ends = block.timestamp + TERM;
        corbel = corbel_;
        pool = pool_;
        team = team_;
        keeper = keeper_;
        maxImpactBps = maxImpactBps_;
    }

    /// Fees arrive from the escrow and are split by collect(). ETH from anyone else is a gift to the burn.
    receive() external payable {
        if (msg.sender != address(escrow) && msg.sender != address(pm)) budget += msg.value;
    }

    function poolKey() external view returns (PoolKey memory) {
        return pool;
    }

    /// The share of new fees that stays for the burn right now.
    function rate() public view returns (uint256) {
        return block.timestamp < penaltyUntil ? PENALTY_BPS : BASE_BPS;
    }

    // ------------------------------------------------------------------------------------------------ fees in

    /// Claims the waiting fees and splits them. Anyone may call it: there is nothing to choose.
    function collect() public nonReentrant {
        _collect();
    }

    function _collect() internal {
        if (escrow.balanceOf(address(this)) > 0) escrow.claim();
        uint256 bps = rate();
        uint256 got = address(this).balance - budget;
        if (got > 0) {
            uint256 keep = (got * bps) / 10_000;
            budget += keep;
            team.sendEth(got - keep);
            emit Collected(got, keep, got - keep, bps);
        }
        // a fee taken in $CORBEL itself needs no purchase: its share burns at once
        if (escrow.balanceOfToken(address(this), corbel) > 0) escrow.claimToken(corbel);
        uint256 coins = IERC20Min(corbel).balanceOf(address(this));
        if (coins > 0) {
            uint256 keep = (coins * bps) / 10_000;
            if (keep > 0) corbel.safeTransfer(DEAD, keep);
            corbel.safeTransfer(team, coins - keep);
            totalBurned += keep;
        }
    }

    /// After TERM, anyone: the fee stream goes back to the team. Fees that cannot be collected never block the hand-back.
    function finish() external {
        require(block.timestamp >= ends, "term");
        require(!finished, "finished");
        finished = true;
        try this.collect() {} catch {}
        factory.transferCreatorFeeRecipient(corbel, team);
        emit Finished(team);
    }

    // ------------------------------------------------------------------------------------------------ burn

    /// Collects, buys with everything set aside, burns it, and writes the record of the checks in the same transaction.
    function burn(bytes32 record) external nonReentrant returns (uint256 out) {
        require(record != bytes32(0), "no record");
        require(msg.sender == keeper || (lastRecord == record && block.timestamp >= lastBurn + SILENT), "keeper");
        require(block.timestamp >= lastBurn + EVERY, "hourly");
        _collect();
        uint256 eth = budget;
        require(eth > 0, "nothing to burn");
        lastBurn = block.timestamp;
        _record(record);

        uint160 sp = _sqrtPrice();
        require(sp > 0, "pool");
        uint160 lim = uint160(uint256(sp) - (uint256(sp) * maxImpactBps) / 20_000); // sqrtP moves about half as much as the price
        _spend = eth;
        _limit = lim <= MIN_SQRT ? MIN_SQRT + 1 : lim;
        uint256 before = address(this).balance;
        out = abi.decode(pm.unlock(""), (uint256));
        uint256 spent = before - address(this).balance;
        require(out > 0 && spent > 0, "no trade");
        budget = eth - spent; // what the price bound left unspent waits for the next hour
        burns++;
        totalEth += spent;
        totalBurned += out;
        emit Burned(burns, record, spent, out);
    }

    function unlockCallback(bytes calldata) external returns (bytes memory) {
        require(msg.sender == address(pm), "pm");
        int256 d = pm.swap(pool, SwapParams(true, -int256(_spend), _limit), "");
        int128 d0 = int128(d >> 128);
        int128 d1 = int128(d);
        if (d0 < 0) pm.settle{value: uint256(uint128(-d0))}();
        uint256 out = d1 > 0 ? uint256(uint128(d1)) : 0;
        if (out > 0) pm.take(pool.currency1, DEAD, out);
        return abi.encode(out);
    }

    function _record(bytes32 record) internal {
        lastRecord = record;
        if (recordedAt[record] == 0) {
            recordedAt[record] = block.timestamp;
            emit Recorded(record);
        }
    }

    // ------------------------------------------------------------------------------------------------ penalties

    /// A sealed verdict that called a token clean and turned out wrong. `verdict` is the leaf's own text ("token|block|results");
    /// the proof must lead to a root this contract recorded at least MIN_AGE ago. A verdict with a failed check is not "clean".
    function wrong(string calldata verdict, bytes32[] calldata proof, bytes32 record) external onlyKeeper {
        bytes32 leaf = keccak256(bytes(verdict));
        require(!counted[leaf], "counted");
        uint256 at = recordedAt[record];
        require(at != 0 && block.timestamp >= at + MIN_AGE, "not sealed before");
        require(_proves(leaf, proof, record), "proof");
        require(!_has(bytes(verdict), "fail"), "flagged");
        counted[leaf] = true;
        _penalty();
        emit Wrong(leaf, record, verdict, penaltyUntil);
    }

    /// A public promise with a date. The date is final.
    function commit(bytes32 id, string calldata what, uint64 due) external onlyKeeper {
        require(promises[id].due == 0, "made");
        require(due > block.timestamp, "past");
        promises[id].due = due;
        emit Promised(id, what, due);
    }

    function delivered(bytes32 id, string calldata proof) external onlyKeeper {
        Promise_ storage p = promises[id];
        require(p.due != 0 && p.delivered == 0, "promise");
        p.delivered = uint64(block.timestamp);
        emit Delivered(id, proof);
    }

    /// Anyone: a promise whose date has passed undelivered costs a day of penalty, once a day, for up to LATE_DAYS days.
    function late(bytes32 id) external {
        Promise_ storage p = promises[id];
        require(p.due != 0 && p.delivered == 0 && block.timestamp > p.due, "not late");
        require(p.lates < LATE_DAYS, "spent");
        require(p.lastLate == 0 || block.timestamp >= uint256(p.lastLate) + 1 days, "daily");
        p.lates++;
        p.lastLate = uint64(block.timestamp);
        _penalty();
        emit Late(id, p.lates, penaltyUntil);
    }

    /// A day from now. Two on the same day are still one day, at the one penalty rate.
    function _penalty() internal {
        penaltyUntil = block.timestamp + PENALTY;
    }

    /// Sorted-pair Merkle proof, the same scheme the public ledger uses.
    function _proves(bytes32 h, bytes32[] calldata proof, bytes32 root) internal pure returns (bool) {
        for (uint256 i; i < proof.length; i++) h = h < proof[i] ? keccak256(abi.encodePacked(h, proof[i])) : keccak256(abi.encodePacked(proof[i], h));
        return h == root;
    }

    function _has(bytes memory s, bytes memory w) internal pure returns (bool) {
        if (s.length < w.length) return false;
        for (uint256 i; i <= s.length - w.length; i++) {
            uint256 j;
            while (j < w.length && s[i + j] == w[j]) j++;
            if (j == w.length) return true;
        }
        return false;
    }

    function _sqrtPrice() internal view returns (uint160) {
        bytes32 id = keccak256(abi.encode(pool));
        return uint160(uint256(pm.extsload(keccak256(abi.encode(id, uint256(6))))));
    }
}
