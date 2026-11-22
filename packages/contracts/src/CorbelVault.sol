// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "./lib/ERC20.sol";
import {Math} from "./lib/Math.sol";
import {ReentrancyGuard, SafeTransfer} from "./lib/SafeTransfer.sol";
import {IERC20Min} from "./interfaces/External.sol";

/**
 * Corbel One vault: one USDG balance held as ERC-4626 shares.
 *
 * Guarantees, by construction:
 *  - No one but the share holder can move their assets. There is no admin withdraw, sweep or upgrade.
 *  - Withdrawals and redeems can never be paused. The guardian can only pause new deposits and set a cap.
 *  - First-depositor inflation is blunted by a virtual share offset (10^6 virtual shares, 1 virtual asset).
 *
 * This version holds USDG idle. Yield is a later, separately audited module; nothing here promises any.
 */
contract CorbelVault is ERC20, ReentrancyGuard {
    using SafeTransfer for address;

    event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares);
    event Withdraw(address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares);
    event DepositsPaused(bool paused);
    event CapSet(uint256 cap);
    event GuardianSet(address guardian);

    uint8 private constant OFFSET = 6;
    address public immutable asset;
    address public guardian;
    bool public depositsPaused;
    uint256 public cap;

    constructor(address asset_, address guardian_, uint256 cap_)
        ERC20("Corbel One USDG", "c1USDG", IERC20Min(asset_).decimals() + OFFSET)
    {
        asset = asset_;
        guardian = guardian_;
        cap = cap_;
    }

    modifier onlyGuardian() {
        require(msg.sender == guardian, "guardian");
        _;
    }

    // ---------- guardian: deposits only ----------

    function setDepositsPaused(bool p) external onlyGuardian {
        depositsPaused = p;
        emit DepositsPaused(p);
    }

    function setCap(uint256 c) external onlyGuardian {
        cap = c;
        emit CapSet(c);
    }

    /// Hand the role on, or renounce it with address(0) (deposits then stay as they are forever).
    function setGuardian(address g) external onlyGuardian {
        guardian = g;
        emit GuardianSet(g);
    }

    // ---------- ERC-4626 views ----------

    function totalAssets() public view returns (uint256) {
        return IERC20Min(asset).balanceOf(address(this));
    }

    function convertToShares(uint256 assets) public view returns (uint256) {
        return Math.mulDiv(assets, totalSupply + 10 ** OFFSET, totalAssets() + 1);
    }

    function convertToAssets(uint256 shares) public view returns (uint256) {
        return Math.mulDiv(shares, totalAssets() + 1, totalSupply + 10 ** OFFSET);
    }

    function maxDeposit(address) public view returns (uint256) {
        if (depositsPaused) return 0;
        uint256 t = totalAssets();
        return t >= cap ? 0 : cap - t;
    }

    function maxMint(address r) external view returns (uint256) {
        return convertToShares(maxDeposit(r));
    }

    function maxWithdraw(address owner) public view returns (uint256) {
        return convertToAssets(balanceOf[owner]);
    }

    function maxRedeem(address owner) external view returns (uint256) {
        return balanceOf[owner];
    }

    function previewDeposit(uint256 assets) public view returns (uint256) {
        return convertToShares(assets); // rounds down: in the vault's favour
    }

    function previewMint(uint256 shares) public view returns (uint256) {
        return Math.mulDivUp(shares, totalAssets() + 1, totalSupply + 10 ** OFFSET);
    }

    function previewWithdraw(uint256 assets) public view returns (uint256) {
        return Math.mulDivUp(assets, totalSupply + 10 ** OFFSET, totalAssets() + 1);
    }

    function previewRedeem(uint256 shares) public view returns (uint256) {
        return convertToAssets(shares);
    }

    // ---------- ERC-4626 actions ----------

    function deposit(uint256 assets, address receiver) external nonReentrant returns (uint256 shares) {
        require(assets <= maxDeposit(receiver), "deposit limit");
        shares = previewDeposit(assets);
        require(shares > 0, "zero shares");
        _pull(assets);
        _mint(receiver, shares);
        emit Deposit(msg.sender, receiver, assets, shares);
    }

    function mint(uint256 shares, address receiver) external nonReentrant returns (uint256 assets) {
        assets = previewMint(shares);
        require(assets <= maxDeposit(receiver), "deposit limit");
        _pull(assets);
        _mint(receiver, shares);
        emit Deposit(msg.sender, receiver, assets, shares);
    }

    function withdraw(uint256 assets, address receiver, address owner) external nonReentrant returns (uint256 shares) {
        shares = previewWithdraw(assets);
        _spend(owner, shares);
        _burn(owner, shares);
        asset.safeTransfer(receiver, assets);
        emit Withdraw(msg.sender, receiver, owner, assets, shares);
    }

    function redeem(uint256 shares, address receiver, address owner) external nonReentrant returns (uint256 assets) {
        assets = previewRedeem(shares);
        require(assets > 0, "zero assets");
        _spend(owner, shares);
        _burn(owner, shares);
        asset.safeTransfer(receiver, assets);
        emit Withdraw(msg.sender, receiver, owner, assets, shares);
    }

    function _pull(uint256 assets) internal {
        // only what actually arrives counts (a fee-on-transfer asset cannot mint free shares)
        uint256 before = totalAssets();
        asset.safeTransferFrom(msg.sender, address(this), assets);
        require(totalAssets() - before == assets, "asset taxed");
    }

    function _spend(address owner, uint256 shares) internal {
        if (msg.sender == owner) return;
        uint256 a = allowance[owner][msg.sender];
        if (a != type(uint256).max) {
            require(a >= shares, "allowance");
            allowance[owner][msg.sender] = a - shares;
        }
    }
}
