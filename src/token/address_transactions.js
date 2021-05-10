"use strict";

const request = require("async-request");
const transactionsMock = require("../__mocks__/transactions.json");
const {
  TX_TYPE,
  isLpToken,
  isPoolToken,
  parseType
} = require("../helpers/transactions");

module.exports = class AddressTransactions {
  constructor(
    platforms,
    cacheManager,
    bscApiKey,
    liquidityTokenCollector,
    tokenCollector,
    priceCollector,
    priceHistory
  ) {
    this.platforms = platforms;
    this.cacheManager = cacheManager;
    this.bscApiKey = bscApiKey;
    this.liquidityTokenCollector = liquidityTokenCollector;
    this.tokenCollector = tokenCollector;
    this.priceCollector = priceCollector;
    this.priceHistory = priceHistory;
  }

  groupByHash(txs) {
    return txs.reduce((map, tx) => {
      if (!map[tx.hash]) {
        map[tx.hash] = [];
      }
      map[tx.hash].push(tx);
      return map;
    }, {});
  }

  addTx(destinationAmount, destinationTxs, tx) {
    if (tx.usd_history) {
      destinationAmount.amount += tx.usd_history;
    }
    destinationTxs.push(tx);
  }

  addTxToWallet(walletCollector, tx) {
    if (tx.usd_history) {
      walletCollector.usd += tx.usd_history;
    }
    walletCollector.txs.push(tx);
  }

  addTokenToWallet(walletCollector, tx) {
    this.addTxToWallet(walletCollector, tx);

    if (!walletCollector.token[tx.symbol]) {
      walletCollector.token[tx.symbol] = {
        usd: 0,
        amount: 0,
        txs: []
      };
    }
    walletCollector.token[tx.symbol].usd += tx.usd_history;
    walletCollector.token[tx.symbol].amount += tx.amount;
    walletCollector.token[tx.symbol].txs.push(tx);
  }

  addLPTokenBuildToWallet(walletCollector, txs) {
    const lpTx = txs.find(isLpToken);

    if (!lpTx) {
      // TODO: how to treat LONG Helmet token?
      console.warn("Not a lp token built here", txs);
      return;
    }

    walletCollector.lpTokenBuild[lpTx.symbol];
    if (!walletCollector.lpTokenBuild[lpTx.symbol]) {
      walletCollector.lpTokenBuild[lpTx.symbol] = {
        usd: 0,
        amount: lpTx.amount,
        txs: [lpTx]
      };
    }

    txs
      .filter(tx => !isLpToken(tx))
      .forEach(tx => {
        walletCollector.lpTokenBuild[lpTx.symbol].usd += tx.usd_history;
        walletCollector.lpTokenBuild[lpTx.symbol].txs.push(tx);
      });
  }

  addPoolBuildToWallet(walletCollector, txs) {
    const poolTx = txs.find(isPoolToken);

    if (!poolTx) {
      console.warn("Not a pool token built here", txs);
      return;
    }

    walletCollector.poolTokenBuild[poolTx.symbol];
    if (!walletCollector.poolTokenBuild[poolTx.symbol]) {
      walletCollector.poolTokenBuild[poolTx.symbol] = {
        usd: 0,
        amount: poolTx.amount,
        txs: [poolTx]
      };
    }

    txs
      .filter(tx => !isPoolToken(tx))
      .forEach(tx => {
        walletCollector.poolTokenBuild[poolTx.symbol].usd += tx.usd_history;
        walletCollector.poolTokenBuild[poolTx.symbol].txs.push(tx);
      });
  }

  addPoolUnstakeToWallet(walletCollector, txs) {
    // const lpTx = txs.find(isLpToken);
    // const harvestTx = txs.find(tx => !isLpToken(tx));
    // this.addLPTokenToWallet(walletCollector, lpTx);

    txs.forEach(tx => this.addTokenToWallet(walletCollector, tx));
    // this.addReward(rewardsCollector, harvestTx);
  }

  addLPTokenToWallet(walletCollector, tx) {
    this.addTxToWallet(walletCollector, tx);

    if (!walletCollector.lpToken[tx.symbol]) {
      walletCollector.lpToken[tx.symbol] = {
        amount: 0,
        txs: []
      };
    }
    walletCollector.lpToken[tx.symbol].amount += tx.amount;
    walletCollector.lpToken[tx.symbol].txs.push(tx);
  }

  addLPUnstakeToWallet(walletCollector, txs) {
    const lpTx = txs.find(isLpToken);
    const harvestTx = txs.find(tx => !isLpToken(tx));

    this.addLPTokenToWallet(walletCollector, lpTx);
    this.addTokenToWallet(walletCollector, harvestTx);
    // this.addReward(rewardsCollector, harvestTx);
  }

  addSwap(swapCollector, tx1, tx2) {
    const swapSymbol = `${tx1.symbol}-${tx2.symbol}`;

    if (!swapCollector[swapSymbol]) {
      swapCollector[swapSymbol] = [];
    }

    swapCollector[swapSymbol].push({
      [tx1.symbol]: { amount: tx1.amount, tx: tx1 },
      [tx2.symbol]: { amount: tx2.amount, tx: tx2 }
    });
  }

  addToVault(vaultCollector, tx) {
    if (!vaultCollector[tx.vault.id]) {
      vaultCollector[tx.vault.id] = {};
    }
    const vault = vaultCollector[tx.vault.id];
    if (!vault[tx.symbol]) {
      vault[tx.symbol] = {
        amount: 0,
        txs: []
      };
    }
    vault[tx.symbol].amount += tx.amount;
    vault[tx.symbol].txs.push(tx);
  }

  async getHistory(address) {
    // const transactions = await this.getTransactions(address);
    const transactions = transactionsMock;
    const initialState = {
      wallet: {
        usd: 0,
        token: {},
        lpToken: {},
        lpTokenBuild: {},
        poolTokenBuild: {},
        txs: []
      },
      swap: {},
      vault: {},
      rewards: { amount: 0, txs: {} },
      unknown: { amount: 0, txs: {} }
    };
    const txsByHash = this.groupByHash(transactions);
    return Object.values(txsByHash).reduce((map, groupedTxs) => {
      const txType = parseType(groupedTxs);
      switch (txType) {
        case TX_TYPE.TOKEN:
          this.addTokenToWallet(map.wallet, groupedTxs[0]);
          break;
        case TX_TYPE.POOL_BUILD:
          this.addPoolBuildToWallet(map.wallet, groupedTxs);
          break;
        case TX_TYPE.POOL_UNSTAKE:
          this.addPoolUnstakeToWallet(map.wallet, groupedTxs);
          break;
        case TX_TYPE.LP_TOKEN_BUILD:
          this.addLPTokenBuildToWallet(map.wallet, groupedTxs);
          break;
        case TX_TYPE.LP_TOKEN:
          this.addLPTokenToWallet(map.wallet, groupedTxs[0]);
          break;
        case TX_TYPE.LP_TOKEN_VAULT:
          this.addToVault(map.vault, groupedTxs[0]);
          break;
        case TX_TYPE.REWARD:
          console.warn(
            "These transactions should be something like a reward",
            groupedTxs
          );
          break;
        case TX_TYPE.LP_UNSTAKE:
          this.addLPUnstakeToWallet(map.wallet, groupedTxs);
          break;
        case TX_TYPE.SWAP:
          this.addTokenToWallet(map.wallet, groupedTxs[0]);
          this.addTokenToWallet(map.wallet, groupedTxs[1]);
          this.addSwap(map.swap, groupedTxs[0], groupedTxs[1]);
          break;
        case TX_TYPE.UNKNOWN:
        default:
          console.warn("Uknown type for transactions", groupedTxs);
          break;
      }
      return map;
    }, initialState);
  }

  async getTransactions(address) {
    const cacheKey = `all-v3-transactions-${address}`;

    // const cache = await this.cacheManager.get(cacheKey);
    // if (cache) {
    //   return cache;
    // }

    const myUrl = "https://api.bscscan.com/api?module=account&action=tokentx&address=%address%&page=1&offset=300&sort=desc&apikey=%apikey%"
      .replace("%address%", address)
      .replace("%apikey%", this.bscApiKey);

    let response = {};
    try {
      const cacheReqKey = `all-v3-transactions-${address}-bscscan`;
      const cacheReq = await this.cacheManager.get(cacheReqKey);
      if (cacheReq) {
        response = cacheReq;
      } else {
        const responseBody = await request(myUrl);
        response = JSON.parse(responseBody.body);
        this.cacheManager.set(cacheReqKey, response, {
          ttl: 60 * 5
        });
      }
    } catch (e) {
      console.error(myUrl, e.message);
      return [];
    }

    const items = await Promise.all(
      this.platforms.getFunctionAwaits("getFarms")
    );

    const map = {};
    items.flat().forEach(i => {
      if (i.extra && i.extra.transactionAddress && i.extra.transactionToken) {
        const item = {
          id: i.id,
          provider: i.provider,
          name: i.name
        };

        if (i.link) {
          item.link = i.link;
        }

        map[
          `${i.extra.transactionAddress.toLowerCase()}-${i.extra.transactionToken.toLowerCase()}`
        ] = item;
      }
    });

    const transactions = await Promise.all(
      response.result
        .filter(t => t.value && t.value > 0 && t.tokenDecimal)
        .map(async t => {
          let amount = t.value / 10 ** t.tokenDecimal;

          if (t.from.toLowerCase() === address.toLowerCase()) {
            amount = -amount;
          }

          let symbol = t.tokenSymbol.toLowerCase();

          const singleSymbol = this.liquidityTokenCollector.getSymbolNames(
            t.contractAddress
          );
          if (singleSymbol) {
            symbol = singleSymbol;
          }

          const lpSymbol = this.liquidityTokenCollector.getSymbolNames(
            t.contractAddress
          );
          if (lpSymbol) {
            symbol = lpSymbol;
          }

          const newVar = {
            timestamp: parseInt(t.timeStamp, 10),
            amount: amount,
            hash: t.hash,
            symbol: symbol.toLowerCase(),
            tokenName: t.tokenName,
            tokenAddress: t.contractAddress,
            from: t.from,
            to: t.to
          };

          let target = t.from.toLowerCase();
          if (target === address.toLowerCase()) {
            target = t.to.toLowerCase();
          }

          if (map[`${target}-${t.contractAddress.toLowerCase()}`]) {
            newVar.vault = map[`${target}-${t.contractAddress.toLowerCase()}`];
          }

          if (t.contractAddress) {
            const currentPrice = this.priceCollector.getPrice(
              t.contractAddress
            );
            if (currentPrice) {
              newVar.usd = newVar.amount * currentPrice;
            }

            const coin = {
              tokenName: t.tokenName,
              symbol: symbol,
              contractAddress: t.contractAddress
            };

            const price = await this.priceHistory.getPriceFromSymbol(
              newVar.timestamp,
              coin,
              t
            );
            if (price) {
              newVar.usd_history = newVar.amount * price;
            }
          }

          return newVar;
        })
    );

    const result = transactions.sort(function(a, b) {
      return b.timestamp - a.timestamp;
    });

    await this.cacheManager.set(cacheKey, result, { ttl: 60 * 5 });

    return result;
  }
};
