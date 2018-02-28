const debug = require('debug')('dx-service:services:BotService')
const getGitInfo = require('../helpers/getGitInfo')
const getVersion = require('../helpers/getVersion')

class BotService {
  constructor ({ auctionRepo, ethereumRepo, exchangePriceRepo, minimumSellVolume }) {
    this._auctionRepo = auctionRepo
    this._exchangePriceRepo = exchangePriceRepo
    this._ethereumRepo = ethereumRepo

    // Config
    this._minimumSellVolume = minimumSellVolume

    // Avoids concurrent calls that might endup buy/selling two times
    this.concurrencyCheck = {}

    // About info
    this._gitInfo = getGitInfo()
    this._version = getVersion()
  }

  async getVersion () {
    return this._version
  }

  async getAbout () {
    const auctionInfo = await this._auctionRepo.getBasicInfo()
    const config = Object.assign({
      minimumSellVolume: this._minimumSellVolume
    }, auctionInfo)

    return {
      name: 'Dutch Exchange - Services',
      version: this._version,
      config,
      git: this._gitInfo
    }
  }

  async testToDelete ({ tokenA, tokenB }) {
    return this._auctionRepo.getPrice({ tokenA, tokenB })
  }

  async ensureSellLiquidity ({ sellToken, buyToken }) {
    debug('Ensure that sell liquidity on %s-%s markets is over $%d',
      sellToken, buyToken,
      this._minimumSellVolume
    )

    if (true /* for the time being */) {
      return {
        token: sellToken,
        soldTokens: 0
      }
    }

    // Check if there's an ongoing liquidity check
    const lockName = `SELL-LIQUIDITY:${tokenA}-${tokenB}`
    let ensureLiquidityPromise = this.concurrencyCheck[lockName]
    if (ensureLiquidityPromise) {
      // We don't do concurrent liquidity
      return ensureLiquidityPromise
    }

    // Check current price and sell volume
    ensureLiquidityPromise = Promise.all([
      // Get current market price
      this._exchangePriceRepo.getPrice({
        tokenA,
        tokenB
      }),

      // Get current market price
      this._exchangePriceRepo.getPrice({
        tokenA: tokenB,
        tokenB: 'USD'
      }),

      // Get sellvolume for auction tokeA-tokenB
      this._auctionRepo.getSellVolume({
        sellToken: tokenA,
        buyToken: tokenB
      }),

      // Get sellvolume for auction tokeB-tokenA
      this._auctionRepo.getSellVolume({
        sellToken: tokenB,
        buyToken: tokenA
      })
    ])
      .then(([
          priceBxA,         // B/A    (i.e. ETH/RDN)
          priceUSDxB,       // USD/B  (i.e. USD/ETH)
          sellVolumeTokenA, // sell tokens of A
          sellVolumeTokenB  // sell tokens of B
      ]) => {
        const sellVolumeInB =
          sellVolumeTokenA * priceBxA +
          sellVolumeTokenB
        const sellVolumenInUSD = sellVolumeInB * priceUSDxB

        let soldTokensPromise
        if (sellVolumenInUSD < this._minimumSellVolume) {
          // Sell tokens to create liquidity
          debug(
            'Not enough sell volume for pair %s-%s: %d %s + %d %s = $%d ',
            tokenA, tokenB,
            sellVolumeTokenA, tokenA,
            sellVolumeTokenB, tokenB,
            sellVolumenInUSD
          )
          soldTokensPromise = this._sellTokenToCreateLiquidity({
            tokenA,
            tokenB,
            priceUSDxB,
            sellVolumenInUSD
          })
        } else {
          // Not sell is required
          debug('No sell is required')
          soldTokensPromise = Promise.resolve({
            amount: 0,
            token: tokenB
          })
        }

        // Free lock
        soldTokensPromise.then(() => {
          this.concurrencyCheck[lockName] = null
        })

        return soldTokensPromise
      })

    // Create lock
    this.concurrencyCheck[lockName] = ensureLiquidityPromise

    return ensureLiquidityPromise
  }

  _sellTokenToCreateLiquidity ({
    tokenA,           // i.e. RDN
    tokenB,           // i.e. ETH
    priceUSDxB,       // USD/B  (i.e. USD/ETH)
    sellVolumenInUSD  // (i.e. $750)
  }) {
    // Sell B
    // TODO: Make sure in which market we should sell
    // See https://docs.google.com/presentation/d/1NVsRFLbwQ4GRTONAWyKH6AT5ZxYBgdhlI_ENZWXlORk/edit#slide=id.g2e0d238c4d_1_0
    const missingDifferenceInB =
      (this._minimumSellVolume - sellVolumenInUSD) / priceUSDxB

    // Sell the missing difference
    debug('Selling %s %d (missing difference)', tokenB, missingDifferenceInB)
    return this._auctionRepo
      .sell({
        sellToken: tokenB,
        buyToken: tokenA,
        amount: missingDifferenceInB,
        auctionIndex: 77 // TODO
      })
      .then(() => ({
        token: tokenB,
        amount: missingDifferenceInB
      }))
  }
}

module.exports = BotService
