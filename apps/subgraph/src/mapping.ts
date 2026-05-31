import {
  Deposited,
  GameTreasuryUpdated,
  InterestHarvested,
  StableConfigured,
  TreasuryUpdated,
  Withdrawn,
} from '../generated/Contract/Contract';
import { BigInt, Bytes } from '@graphprotocol/graph-ts';
import {
  Deposit,
  User,
  UserTokenStakeBalance,
  Harvest,
  TreasuryUpdate,
  GameTreasuryUpdate,
  StableConfig,
  Withdrawal,
} from '../generated/schema';

function getOrCreateUser(userId: string): User {
  let user = User.load(userId);
  if (!user) {
    user = new User(userId);
    user.save();
  }
  return user;
}

function tokenBalanceId(userId: string, tokenHex: string): string {
  return userId.concat('-').concat(tokenHex);
}

function getOrCreateTokenBalance(
  userId: string,
  tokenHex: string
): UserTokenStakeBalance {
  let balance = UserTokenStakeBalance.load(tokenBalanceId(userId, tokenHex));
  if (!balance) {
    balance = new UserTokenStakeBalance(tokenBalanceId(userId, tokenHex));
    balance.user = userId;
    balance.token = Bytes.fromHexString(tokenHex);
    balance.stakedAmount = BigInt.zero();
    balance.updatedAt = BigInt.zero();
  }
  return balance;
}

export function handleDeposited(event: Deposited): void {
  let userId = event.params.user.toHexString();
  let user = getOrCreateUser(userId);
  let tokenHex = event.params.depositToken.toHexString();

  let id = event.params.user
    .toHexString()
    .concat('-')
    .concat(event.params.depositId.toString());
  let deposit = new Deposit(id);
  deposit.depositId = event.params.depositId;
  deposit.user = user.id;
  deposit.token = event.params.depositToken;
  deposit.amount = event.params.depositAmount;
  deposit.yieldAmount = event.params.yieldAmount;
  deposit.pointsMinted = event.params.pointsMinted;
  deposit.unlockAt = event.params.unlockAt;
  deposit.withdrawn = false;
  deposit.timestamp = event.block.timestamp;
  deposit.txHash = event.transaction.hash;
  deposit.save();

  let tokenBalance = getOrCreateTokenBalance(user.id, tokenHex);
  tokenBalance.stakedAmount = tokenBalance.stakedAmount.plus(
    event.params.depositAmount
  );
  tokenBalance.updatedAt = event.block.timestamp;
  tokenBalance.save();
}

export function handleWithdrawn(event: Withdrawn): void {
  let userId = event.params.user.toHexString();
  let tokenHex = event.params.token.toHexString();
  getOrCreateUser(userId);

  let id = event.params.user
    .toHexString()
    .concat('-')
    .concat(event.params.depositId.toString());
  let deposit = Deposit.load(id);
  if (deposit) {
    deposit.withdrawn = true;
    deposit.withdrawalTx = event.transaction.hash;
    deposit.save();

    let withdrawal = new Withdrawal(
      event.transaction.hash
        .toHexString()
        .concat('-')
        .concat(event.logIndex.toString())
    );
    withdrawal.user = event.params.user.toHexString();
    withdrawal.deposit = deposit.id;
    withdrawal.token = event.params.token;
    withdrawal.amount = event.params.amount;
    withdrawal.timestamp = event.block.timestamp;
    withdrawal.txHash = event.transaction.hash;
    withdrawal.save();
  }

  let tokenBalance = getOrCreateTokenBalance(userId, tokenHex);
  let nextAmount = tokenBalance.stakedAmount.minus(event.params.amount);
  if (nextAmount.lt(BigInt.zero())) {
    nextAmount = BigInt.zero();
  }
  tokenBalance.stakedAmount = nextAmount;
  tokenBalance.updatedAt = event.block.timestamp;
  tokenBalance.save();
}

export function handleInterestHarvested(event: InterestHarvested): void {
  let harvest = new Harvest(
    event.transaction.hash
      .toHexString()
      .concat('-')
      .concat(event.logIndex.toString())
  );
  harvest.totalAmount = event.params.totalAmount;
  harvest.treasuryPortion = event.params.treasuryPortion;
  harvest.gameTreasuryPortion = event.params.gameTreasuryPortion;
  harvest.timestamp = event.block.timestamp;
  harvest.txHash = event.transaction.hash;
  harvest.save();
}

export function handleStableConfigured(event: StableConfigured): void {
  let config = new StableConfig(event.params.yieldToken.toHexString());
  config.yieldTokenDecimals = event.params.yieldTokenDecimals;
  config.yieldAToken = event.params.yieldAToken;
  config.timestamp = event.block.timestamp;
  config.txHash = event.transaction.hash;
  config.save();
}

export function handleTreasuryUpdated(event: TreasuryUpdated): void {
  let update = new TreasuryUpdate(
    event.transaction.hash
      .toHexString()
      .concat('-')
      .concat(event.logIndex.toString())
  );
  update.newTreasury = event.params.treasury;
  update.timestamp = event.block.timestamp;
  update.txHash = event.transaction.hash;
  update.save();
}

export function handleGameTreasuryUpdated(event: GameTreasuryUpdated): void {
  let update = new GameTreasuryUpdate(
    event.transaction.hash
      .toHexString()
      .concat('-')
      .concat(event.logIndex.toString())
  );
  update.newGameTreasury = event.params.gameTreasury;
  update.timestamp = event.block.timestamp;
  update.txHash = event.transaction.hash;
  update.save();
}
