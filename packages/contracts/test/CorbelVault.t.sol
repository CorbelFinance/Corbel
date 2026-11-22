// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Base, MockToken} from "./Base.sol";
import {CorbelVault} from "../src/CorbelVault.sol";

contract CorbelVaultTest is Base {
    MockToken usdg;
    CorbelVault vault;
    address guardian = address(0xA11CE);
    address alice = address(0xA1);
    address bob = address(0xB0);
    address eve = address(0xE7E);

    function setUp() public {
        usdg = new MockToken(6);
        vault = new CorbelVault(address(usdg), guardian, 1_000_000e6);
        for (uint256 i = 0; i < 3; i++) {
            address u = [alice, bob, eve][i];
            usdg.mint(u, 2_000_000e6);
            vm.prank(u);
            usdg.approve(address(vault), type(uint256).max);
        }
    }

    function test_depositRedeemRoundTrip() public {
        vm.prank(alice);
        uint256 shares = vault.deposit(1_000e6, alice);
        eq(vault.decimals(), 12, "decimals = asset + offset");
        vm.prank(alice);
        uint256 back = vault.redeem(shares, alice, alice);
        // rounding is always in the vault's favour, by at most one unit
        lte(back, 1_000e6, "never more than deposited");
        gte(back, 1_000e6 - 1, "lose at most 1 unit");
    }

    function test_inflationAttackDoesNotPay() public {
        // classic attack: first depositor mints 1 unit of shares, then donates to skew the price
        vm.prank(eve);
        vault.deposit(1, eve);
        vm.prank(eve);
        usdg.transfer(address(vault), 100_000e6);
        vm.prank(alice);
        uint256 s = vault.deposit(10_000e6, alice);
        ok(s > 0, "victim gets shares");
        // the victim keeps almost all of the deposit; the attacker loses most of the donation
        vm.prank(alice);
        uint256 back = vault.redeem(s, alice, alice);
        gte(back, (10_000e6 * 9_990) / 10_000, "victim loses under 0.1%");
        uint256 eveShares = vault.balanceOf(eve);
        vm.prank(eve);
        uint256 eveBack = vault.redeem(eveShares, eve, eve);
        lte(eveBack, 100_000e6, "attacker cannot profit");
    }

    function test_pauseBlocksDepositsNeverWithdrawals() public {
        vm.prank(alice);
        uint256 shares = vault.deposit(500e6, alice);
        vm.prank(guardian);
        vault.setDepositsPaused(true);
        vm.prank(bob);
        vm.expectRevert(bytes("deposit limit"));
        vault.deposit(1e6, bob);
        vm.prank(alice);
        uint256 back = vault.redeem(shares, alice, alice);
        gte(back, 500e6 - 1, "withdraw while paused");
    }

    function test_capAndGuardianOnly() public {
        vm.prank(alice);
        vm.expectRevert(bytes("deposit limit"));
        vault.deposit(1_000_001e6, alice);
        vm.prank(alice);
        vm.expectRevert(bytes("guardian"));
        vault.setCap(0);
        vm.prank(guardian);
        vault.setGuardian(address(0));
        vm.prank(guardian);
        vm.expectRevert(bytes("guardian"));
        vault.setDepositsPaused(true);
    }

    function test_allowanceForThirdPartyRedeem() public {
        vm.prank(alice);
        uint256 shares = vault.deposit(100e6, alice);
        vm.prank(bob);
        vm.expectRevert(bytes("allowance"));
        vault.redeem(shares, bob, alice);
        vm.prank(alice);
        vault.approve(bob, shares);
        vm.prank(bob);
        vault.redeem(shares, bob, alice);
        eq(vault.balanceOf(alice), 0, "alice burned");
    }

    function test_taxedAssetRejected() public {
        usdg.setTax(100);
        vm.prank(alice);
        vm.expectRevert(bytes("asset taxed"));
        vault.deposit(100e6, alice);
    }
}
