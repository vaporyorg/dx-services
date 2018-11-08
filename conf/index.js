const debug = require('debug')('DEBUG-dx-service:conf')

const SPECIAL_TOKENS = ['WETH', 'MGN', 'OWL', 'GNO']
const getTokenOrder = require('../src/helpers/getTokenOrder')

// Get environment: local, dev, pro
let environment = process.env.NODE_ENV ? process.env.NODE_ENV.toLowerCase() : 'local'
process.env.NODE_ENV = environment === 'test' ? 'local' : environment

// Load conf
const defaultConf = {
  ...require('./config-base'),
  ...require('./config-api'),
  ...require('./config-bots'),
  ...require('./config-contracts'),
  ...require('./config-notification'),
  ...require('./config-repos')
}

// Load env conf
let envConfFileName
if (environment === 'pre' || environment === 'pro') {
  // PRE and PRO share the same config on purpose (so they are more alike)
  // differences are modeled just as ENV_VARs
  envConfFileName = 'prepro-config'
} else {
  envConfFileName = environment + '-config'
}
const envConf = require('./env/' + envConfFileName)

// Load network conf
const network = process.env.NETWORK
  ? process.env.NETWORK.toLowerCase()
  : 'ganache' // Optional: RINKEBY, KOVAN
const networkConfig = network ? require(`./network/${network}-config`) : {}

// Load custom config file (override default conf)
const customConfigFile = process.env.CONFIG_FILE
let customConfig = customConfigFile ? require(customConfigFile) : {}

// Get markets
const markets =
  customConfig.MARKETS ||
  getEnvMarkets() ||
  envConf.MARKETS ||
  defaultConf.MARKETS
debug('markets: %o', markets)

// Get tokens
const tokens = getConfiguredTokenList(markets)
// debug('tokens: %o', tokens)
// debug('envVars: %o', envVars)

// Merge all configs
const config = {
  ...defaultConf,
  ...envConf,
  ...networkConfig,
  ...customConfig,
  MARKETS: markets.map(orderMarketTokens)
}
config.ERC20_TOKEN_ADDRESSES = getTokenAddresses(tokens, config)

debug('tokens', tokens)
debug('config.ERC20_TOKEN_ADDRESSES', config.ERC20_TOKEN_ADDRESSES)
// debug('config.ERC20_TOKEN_ADDRESSES: \n%O', config.ERC20_TOKEN_ADDRESSES)

// Normalize token order for markets (alphabet order)
function orderMarketTokens ({ tokenA, tokenB }) {
  const [ sortedTokenA, sortedTokenB ] = getTokenOrder(tokenA, tokenB)
  return { tokenA: sortedTokenA, tokenB: sortedTokenB }
}

function getEnvMarkets () {
  const envMarkets = process.env.MARKETS
  if (envMarkets) {
    const marketsArray = envMarkets.split(',')
    return marketsArray.map(marketString => {
      const market = marketString.split('-')
      return {
        tokenA: market[0],
        tokenB: market[1]
      }
    })
  } else {
    return null
  }
}

function getConfiguredTokenList (markets) {
  const result = []

  function isSpecialToken (token) {
    return SPECIAL_TOKENS.indexOf(token) !== -1
  }

  function addToken (token) {
    if (!result.includes(token) && !isSpecialToken(token)) {
      result.push(token)
    }
  }

  markets.forEach(({ tokenA, tokenB }) => {
    addToken(tokenA)
    addToken(tokenB)
  })

  return result
}

function getTokenAddresParamName (token) {
  return `${token}_TOKEN_ADDRESS`
}

function getTokenAddresses (tokens, config) {
  return tokens.reduce((tokenAddresses, token) => {
    const paramName = getTokenAddresParamName(token)
    const address = config[paramName]
    if (address) {
      tokenAddresses[token] = address
    } else if (config.ENVIRONMENT === 'local') {
      tokenAddresses[token] = null
    } else {
      throw new Error(`The token ${token} is declared in the market, but no \
param ${paramName} was specified. Environemnt: ${config.ENVIRONMENT}`)
    }
    return tokenAddresses
  }, {})
}

module.exports = config
