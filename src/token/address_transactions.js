"use strict";

const request = require("async-request");

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

          // Aparentemente se agrupan por hash las tx
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
