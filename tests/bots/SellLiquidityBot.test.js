const SellLiquidityBot = require('../../src/bots/SellLiquidityBot')
const EventBus = require('../../src/helpers/EventBus')

const testSetup = require('../helpers/testSetup')
const setupPromise = testSetup()

const BigNumber = require('bignumber.js')

const MARKETS = [
  { tokenA: 'ETH', tokenB: 'RDN' },
  { tokenA: 'ETH', tokenB: 'OMG' }
]

let sellLiquidityBot

beforeEach(async () => {
  const { liquidityService } = await setupPromise

  sellLiquidityBot = new SellLiquidityBot({
    name: 'SellLiquidityBot',
    eventBus: new EventBus(),
    liquidityService,
    botAddress: '0x123',
    markets: MARKETS
  })

  jest.useFakeTimers()

  sellLiquidityBot.start()
})

afterEach(() => {
  sellLiquidityBot.stop()
})

test.only('It should do a routine check.', async () => {
  // we mock ensureSellLiquidity function
  sellLiquidityBot._liquidityService.ensureSellLiquidity = jest.fn(_ensureLiquidity)
  const ENSURE_SELL_LIQUIDITY = sellLiquidityBot._liquidityService.ensureSellLiquidity

  // GIVEN never ensured liquidity market
  expect(ENSURE_SELL_LIQUIDITY).toHaveBeenCalledTimes(0)

  // WHEN we wait for an expected time
  jest.runOnlyPendingTimers()

  // THEN bot autochecked liquidity for all markets just in case
  expect(ENSURE_SELL_LIQUIDITY).toHaveBeenCalledTimes(2)
})

test('It should trigger ensure liquidity from eventBus trigger', () => {
  // we mock ensureSellLiquidity function
  sellLiquidityBot._liquidityService.ensureSellLiquidity = jest.fn(_ensureLiquidity)
  const ENSURE_SELL_LIQUIDITY = sellLiquidityBot._liquidityService.ensureSellLiquidity

  // we wrap expected eventBus triggered function with mock
  sellLiquidityBot._onAuctionCleared = jest.fn(sellLiquidityBot._onAuctionCleared)

  // GIVEN uncalled liquidity functions
  expect(sellLiquidityBot._onAuctionCleared).toHaveBeenCalledTimes(0)
  expect(ENSURE_SELL_LIQUIDITY).toHaveBeenCalledTimes(0)

  // WHEN we trigger 'auction:cleared' event
  sellLiquidityBot._eventBus.trigger('auction:cleared', {buyToken: 'RDN', sellToken: 'ETH'})

  // THEN liquidity ensuring functions have been called
  expect(sellLiquidityBot._onAuctionCleared).toHaveBeenCalledTimes(1)
  expect(ENSURE_SELL_LIQUIDITY).toHaveBeenCalledTimes(1)
})

test('It should not ensure liquidity if already ensuring liquidity.', () => {
  expect.assertions(1)
  // we mock ensureSellLiquidity function
  sellLiquidityBot._liquidityService.ensureSellLiquidity = _concurrentLiquidityEnsured

  // GIVEN a running bot

  // WHEN we ensure liquidity
  const ENSURE_LIQUIDITY = sellLiquidityBot._onAuctionCleared('auction:cleared',
    {buyToken: 'RDN', sellToken: 'ETH'})

  // THEN liquidiy is ensured correctly
  ENSURE_LIQUIDITY.then(result => {
    expect(result).toBeTruthy()
  })
})

test('It should ensure liquidity.', () => {
  expect.assertions(3)
  // we mock ensureSellLiquidity function
  sellLiquidityBot._liquidityService.ensureSellLiquidity = jest.fn(_ensureLiquidity)
  const ENSURE_SELL_LIQUIDITY_FN = sellLiquidityBot._liquidityService.ensureSellLiquidity

  // GIVEN never ensured liquidity  market
  expect(ENSURE_SELL_LIQUIDITY_FN).toHaveBeenCalledTimes(0)

  // WHEN we ensure liquidity
  const ENSURE_LIQUIDITY = sellLiquidityBot._onAuctionCleared('auction:cleared',
    {buyToken: 'RDN', sellToken: 'ETH'})

  // THEN liquidiy is ensured correctly
  ENSURE_LIQUIDITY.then(result => {
    expect(result).toBeTruthy()
  })
  expect(ENSURE_SELL_LIQUIDITY_FN).toHaveBeenCalledTimes(1)
})

function _concurrentLiquidityEnsured ({ sellToken, buyToken, from }) {
  return Promise.resolve(null)
}

function _ensureLiquidity ({ sellToken, buyToken, from }) {
  return Promise.resolve({
    sellToken,
    buyToken,
    amount: new BigNumber('522943983903581200'),
    amountInUSD: new BigNumber('523.97')
  })
}
