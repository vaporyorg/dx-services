const formatUtil = require('../../helpers/formatUtil')
const _tokenPairSplit = formatUtil.tokenPairSplit

function createRoutes ({ dxInfoService }) {
  const routes = []

  routes.push({
    path: '/',
    get (req, res) {
      return dxInfoService.getMarkets()
    }
  })

  routes.push({
    path: '/:tokenPair/state',
    get (req, res) {
      let tokenPair = _tokenPairSplit(req.params.tokenPair)
      return dxInfoService.getState(tokenPair)
    }
  })

  routes.push({
    path: '/:tokenPair/price',
    get (req, res) {
      let tokenPair = _tokenPairSplit(req.params.tokenPair)
      return dxInfoService.getCurrentPrice(tokenPair)
    }
  })

  routes.push({
    path: '/:tokenPair/closing-prices',
    get (req, res) {
      let tokenPair = _tokenPairSplit(req.params.tokenPair)
      let count = req.query.count !== undefined ? req.query.count : 5
      let params = Object.assign(
        tokenPair, { count: count }
      )
      return dxInfoService.getLastClosingPricesComputed(params)
    }
  })

  routes.push({
    path: '/:tokenPair/closing-prices/:auctionIndex',
    get (req, res) {
      let tokenPair = _tokenPairSplit(req.params.tokenPair)
      let params = Object.assign(
        tokenPair,
        { auctionIndex: req.params.auctionIndex }
      )
      return dxInfoService.getClosingPrice(params)
    }
  })

  routes.push({
    path: '/:tokenPair/current-index',
    get (req, res) {
      let tokenPair = _tokenPairSplit(req.params.tokenPair)
      return dxInfoService.getAuctionIndex(tokenPair)
    }
  })

  routes.push({
    path: '/:tokenPair/auction-start',
    get (req, res) {
      let tokenPair = _tokenPairSplit(req.params.tokenPair)
      return dxInfoService.getAuctionStart(tokenPair)
    }
  })

  routes.push({
    path: '/:tokenPair/is-approved-market',
    get (req, res) {
      let tokenPair = _tokenPairSplit(req.params.tokenPair)
      return dxInfoService.isApprovedMarket(tokenPair)
    }
  })

  routes.push({
    path: '/:tokenPair/extra-tokens/:auctionIndex',
    get (req, res) {
      let tokenPair = _tokenPairSplit(req.params.tokenPair)
      let params = Object.assign(
        tokenPair,
        { auctionIndex: req.params.auctionIndex }
      )
      return dxInfoService.getExtraTokens(params)
    }
  })

  routes.push({
    path: '/:tokenPair/sell-volume',
    get (req, res) {
      let tokenPair = _tokenPairSplit(req.params.tokenPair)
      return dxInfoService.getSellVolume(tokenPair)
    }
  })

  // TODO check empty response
  routes.push({
    path: '/:tokenPair/sell-volume-next',
    get (req, res) {
      let tokenPair = _tokenPairSplit(req.params.tokenPair)
      return dxInfoService.getSellVolumeNext(tokenPair)
    }
  })

  routes.push({
    path: '/:tokenPair/buy-volume',
    get (req, res) {
      let tokenPair = _tokenPairSplit(req.params.tokenPair)
      return dxInfoService.getBuyVolume(tokenPair)
    }
  })

  return routes
}

module.exports = createRoutes