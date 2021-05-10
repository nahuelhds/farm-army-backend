const TX_TYPE = Object.freeze({
  TOKEN: "TOKEN",
  LP_TOKEN_BUILD: "LP_TOKEN_BUILD",
  LP_TOKEN: "LP_TOKEN",
  LP_TOKEN_VAULT: "LP_TOKEN_VAULT",
  LP_UNSTAKE: "LP_UNSTAKE",
  POOL_BUILD: "POOL_BUILD",
  POOL_UNSTAKE: "POOL_UNSTAKE",
  REWARD: "REWARD",
  SWAP: "SWAP",
  LP_UNKNOWN: "LP_UNKNOWN",
  POOL_UNKNOWN: "POOL_UNKNOWN",
  UNKNOWN: "UNKNOWN"
});

function isLpToken(tx) {
  return (
    tx.tokenName.toLowerCase().indexOf("peg") === -1 &&
    tx.symbol.indexOf("-") > -1
  );
}

function isPoolToken(tx) {
  return (
    tx.symbol === "syrup" || (tx.vault && tx.vault.id.indexOf("pool") > -1)
  );
}

function parseType(groupedTxs) {
  if (groupedTxs.length > 3) {
    if (groupedTxs.find(tx => tx.tokenName.indexOf("bDollar") > -1)) {
      return TX_TYPE.POOL_UNSTAKE;
    }

    return TX_TYPE.UNKNOWN;
  }

  if (groupedTxs.length === 3) {
    if (groupedTxs.filter(isPoolToken).length > 0) {
      return TX_TYPE.POOL_BUILD;
    }
    if (groupedTxs.filter(isLpToken).length > 0) {
      return TX_TYPE.LP_TOKEN_BUILD;
    }

    return TX_TYPE.POOL_UNSTAKE;
  }

  if (groupedTxs.length === 2) {
    const tx1 = groupedTxs[0];
    const tx2 = groupedTxs[1];

    if (isLpToken(tx1) || isLpToken(tx2)) {
      // TODO: diff between LP_UNSTAKE and LP_UNBUILD because I'm missing the returned BNB
      return TX_TYPE.LP_UNSTAKE;
    }

    if (isPoolToken(tx1) || isPoolToken(tx2)) {
      return TX_TYPE.POOL_UNKNOWN;
    }

    if (tx1.from === tx2.to || tx1.to === tx2.from) {
      return TX_TYPE.SWAP;
    }

    return TX_TYPE.REWARD;
  }
  if (groupedTxs.length === 1) {
    const tx = groupedTxs[0];
    if (tx.vault) {
      return TX_TYPE.LP_TOKEN_VAULT;
    }

    if (isLpToken(tx)) {
      return TX_TYPE.LP_TOKEN;
    }

    return TX_TYPE.TOKEN;
  }

  return TX_TYPE.UNKNOWN;
}

module.exports = {
  TX_TYPE,
  isLpToken,
  isPoolToken,
  parseType
};
