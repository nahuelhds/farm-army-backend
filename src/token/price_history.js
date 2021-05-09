const fetch = require("node-fetch");
const dayjs = require("dayjs");
const coins = require("./coingecko_coins_list.json");

module.exports = class PriceHistory {
  constructor(cacheManager) {
    this.cacheManager = cacheManager;
    this.prices = {};
    this.pricesSymbols = {};
    this.coinsByBinanceToken = coins
      .filter(coin => coin.platforms["binance-smart-chain"])
      .reduce((coinMap, coin) => {
        coinMap[coin.platforms["binance-smart-chain"]] = coin;
        return coinMap;
      }, {});

    this.coinsByName = coins.filter();
  }

  async getPrice(timestamp, contractAddress) {
    const dmY = dayjs.unix(timestamp).format("DD-MM-YYYY");
    const cacheKey = `price-history-address-${contractAddress.toLowerCase()}-${dmY}`;
    const cachePrice = await this.cacheManager.get(cacheKey);

    if (cachePrice) {
      return cachePrice.usd;
    }
    try {
      const { id: coinId } = this.coinsByBinanceToken[contractAddress];
      if (!coinId) {
        console.warn(
          `Contract address ${contractAddress} has not related coin`
        );
        return 0;
      }
      const {
        market_data: { current_price: price }
      } = await fetch(
        `https://api.coingecko.com/api/v3/${coinId}/history?date=${dmY}&localization=false`
      )
        .then(res => res.json())
        .then(res => res.data);
      await this.cacheManager.set(cacheKey, price, { ttl: 0 }); // save forever
      return price.usd;
    } catch (e) {
      console.error(
        `An unknown error ocurred with contract address ${contractAddress}. Reason:`,
        e
      );
      return 0;
    }
  }
};
