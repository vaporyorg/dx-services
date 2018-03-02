const debug = require('debug')('dx-service:bots:SellLiquidityBot')
const events = require('../helpers/events')
const ENSURE_LIQUIDITY_PERIODIC_CHECK_MILLISECONDS = 10000

class SellLiquidityBot {
  constructor ({ eventBus, botService, botAddress, markets }) {
    this._eventBus = eventBus
    this._botService = botService
    this._botAddress = botAddress
    this._markets = markets
  }

  async run () {
    debug('Initialized bot')

    // Ensure the sell liquidity when an aunction has ended
    this._eventBus.listenTo(events.EVENT_AUCTION_CLRARED, ({ eventName, data }) => {
      const { sellToken, buyToken } = data

      // Do ensure liquidity on the market
      this._ensureSellLiquidity({
        sellToken,
        buyToken,
        from: this._botAddress
      })
    })

    // Backup strategy, in case events fail to notify the bot
    // From time to time, we ensure the liquidity
    setInterval(() => {
      this._markets.forEach(market => {
        // Do ensure liquidity on the market
        this._ensureSellLiquidity({
          sellToken: market.tokenA,
          buyToken: market.tokenB,
          from: this._botAddress
        })
      })
    }, ENSURE_LIQUIDITY_PERIODIC_CHECK_MILLISECONDS)
  }

  async stop () {
    debug('Bot stopped')
  }

  async _ensureSellLiquidity ({ sellToken, buyToken, from }) {
    debug("An auction for the par %s-%s has ended. Let's ensure the liquidity",
      sellToken, buyToken)

    return this
      ._botService
      .ensureSellLiquidity({ sellToken, buyToken, from })
      .then(soldTokens => {
        if (soldTokens) {
          debug("I've sold %d %s tokens to ensure liquidity on the market %s-%s",
            soldTokens.amount,
            soldTokens.sellToken,
            sellToken,
            buyToken
          )
        } else {
          debug('There was no need to sell any token to ensure liquidity on the market %s-%s',
            sellToken, buyToken
          )
        }
      })
      .catch(error => {
        // TODO: How do we handle this error?
        // It would be nice, at list a slack message or sth
        console.error(error)
      })
  }
}

module.exports = SellLiquidityBot
