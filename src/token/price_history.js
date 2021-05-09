const fetch = require("node-fetch");
const dayjs = require("dayjs");
const normalizedCoins = require("./coingecko_coins_list-custom.json");
const coingeckoCoins = require("./coingecko_coins_list.json");

const coins = [...coingeckoCoins, ...normalizedCoins];

module.exports = class PriceHistory {
  constructor(cacheManager) {
    this.cacheManager = cacheManager;
    this.prices = {};
    this.pricesSymbols = {};
    this.coinsByBinanceToken = coins.reduce((coinMap, coin) => {
      coinMap[coin.platforms["binance-smart-chain"]] = coin;
      return coinMap;
    }, {});

    this.coinsBySymbol = coins.reduce((coinMap, coin) => {
      if (!coinMap[coin.symbol]) {
        coinMap[coin.symbol] = [];
      }
      coinMap[coin.symbol].push(coin);
      return coinMap;
    }, {});
  }

  async getPriceFromAddress(timestamp, contractAddress) {
    const dmY = dayjs.unix(timestamp).format("DD-MM-YYYY");
    const cacheKey = `price-history-address-${contractAddress.toLowerCase()}-${dmY}`;
    const cachePrice = await this.cacheManager.get(cacheKey);

    if (cachePrice) {
      return cachePrice.usd;
    }
    try {
      const { id: coinId = null } = this.coinsByBinanceToken[contractAddress];
      if (!coinId) {
        console.warn(
          `Contract address ${contractAddress} has not related coin`
        );
        return 0;
      }

      return this.getPriceFromCoinId(cacheKey, coinId, dmY);
    } catch (e) {
      console.error(
        `An unknown error ocurred with contract address ${contractAddress}. Reason:`,
        e
      );
      return 0;
    }
  }

  async getPriceFromSymbol(
    timestamp,
    { symbol, tokenName, contractAddress },
    { tokenSymbol }
  ) {
    const dmY = dayjs.unix(timestamp).format("DD-MM-YYYY");
    const cacheKey = `price-history-symbol-${symbol}-${dmY}`;
    const cachePrice = await this.cacheManager.get(cacheKey);

    if (cachePrice) {
      return cachePrice;
    }
    try {
      let coinId;
      const candidateCoins =
        this.coinsBySymbol[symbol] || this.coinsBySymbol[tokenSymbol];
      if (!candidateCoins) {
        console.warn(
          `Could not find coin for ${symbol} with contract address ${contractAddress}`
        );
        return 0;
      }

      if (candidateCoins.length === 1) {
        coinId = candidateCoins[0].id;
      } else {
        const foundCoin = candidateCoins.find(
          candidateCoin =>
            (candidateCoin.platform &&
              candidateCoin.platform["binance-smart-chain"] ===
                contractAddress) ||
            [symbol, tokenSymbol].indexOf(candidateCoin.id) ||
            candidateCoin.name.toLowerCase() === tokenName.toLowerCase()
        );
        if (foundCoin) {
          coinId = foundCoin.id;
        } else {
          console.warn(
            `Could not find coin for ${symbol} with contract address ${contractAddress}`
          );
          return 0;
        }
      }

      const price = await this.getPriceFromCoinId(cacheKey, coinId, dmY);
      await this.cacheManager.set(cacheKey, price, { ttl: 60 * 60 * 24 * 365 }); // save forever
      return price;
    } catch (e) {
      console.error(
        `An unknown error occurred with symbol ${symbol} with contract address ${contractAddress}. Reason:`,
        e
      );
      return 0;
    }
  }

  async getPriceFromCoinId(cacheKey, coinId, dmY) {
    const url = `https://api.coingecko.com/api/v3/coins/${coinId}/history?date=${dmY}&localization=false`;
    try {
      const { market_data: marketData } = await fetch(url).then(res =>
        res.json()
      );
      if (!marketData) {
        console.warn(`No price registry for ${coinId} at ${dmY}`);
        return 0;
      }
      return marketData.current_price.usd;
    } catch (e) {
      console.error(
        `An unknown error occurred while getting the historic price for ${coinId} on date ${dmY}`,
        url,
        e
      );
      throw e;
    }
  }
};
