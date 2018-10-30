const loggerNamespace = 'dx-service:bots:BalanceCheckBot'
const Bot = require('./Bot')
const Logger = require('../helpers/Logger')
const logger = new Logger(loggerNamespace)
const formatUtil = require('../helpers/formatUtil')
const numberUtil = require('../helpers/numberUtil')

const getBotAddress = require('../helpers/getBotAddress')

const MINIMUM_AMOUNT_IN_USD_FOR_TOKENS = process.env.BALANCE_CHECK_THRESHOLD_USD || 5000 // $5000
const MINIMUM_AMOUNT_FOR_ETHER = (process.env.BALANCE_CHECK_THRESHOLD_ETHER || 0.4) * 1e18 // 0.4 WETH

const checkTimeMinutes = process.env.BALANCE_BOT_CHECK_TIME_MINUTES || 15 // 15 min
const slackThresholdMinutes = process.env.BALANCE_BOT_SLACK_THESHOLD_MINUTES || (4 * 60) // 4h
const PERIODIC_CHECK_MILLISECONDS = checkTimeMinutes * 60 * 1000
const MINIMUM_TIME_BETWEEN_SLACK_NOTIFICATIONS = slackThresholdMinutes * 60 * 1000

class BalanceCheckBot extends Bot {
  constructor ({
    name,
    eventBus,
    liquidityService,
    dxInfoService,
    ethereumClient,
    tokensByAccount,
    slackClient,
    botFundingSlackChannel,
    minimumAmountInUsdForToken = MINIMUM_AMOUNT_IN_USD_FOR_TOKENS,
    minimumAmountForEther = MINIMUM_AMOUNT_FOR_ETHER
  }) {
    super(name)
    this._liquidityService = liquidityService
    this._dxInfoService = dxInfoService
    this._ethereumClient = ethereumClient
    this._slackClient = slackClient
    this._botFundingSlackChannel = botFundingSlackChannel
    this._minimumAmountInUsdForToken = minimumAmountInUsdForToken
    this._minimumAmountForEther = minimumAmountForEther

    this._tokensByAccount = tokensByAccount

    this._lastCheck = null
    this._lastWarnNotification = null
    this._lastError = null
    this._lastSlackEtherBalanceNotification = null
    this._lastSlackTokenBalanceNotification = null
  }

  async _doStart () {
    logger.debug({ msg: 'Initialized bot: ' + this.name })

    // Check the bots balance periodically
    this._checkBalance()
    setInterval(() => {
      return this._checkBalance()
    }, PERIODIC_CHECK_MILLISECONDS)
  }

  async _doStop () {
    logger.debug({ msg: 'Bot stopped: ' + this.name })
  }

  async _checkBalance () {
    this._lastCheck = new Date()
    let botHasEnoughTokens
    try {
      const accountKeys = Object.keys(this._tokensByAccount)

      const accountAddressesPromises = accountKeys.map(accountKey => {
        return getBotAddress(this._ethereumClient, accountKey)
      })

      const accountAddresses = await Promise.all(accountAddressesPromises)

      const balanceOfEtherPromises = accountAddresses.map(account => {
        // Get ETH balance
        return this._dxInfoService.getBalanceOfEther({ account })
      })

      const balanceOfTokensPromises = accountAddresses.map((account, index) => {
        // Get balance of ERC20 tokens
        return this._liquidityService.getBalances({
          tokens: this._tokensByAccount[accountKeys[index]].tokens,
          address: account
        })
      })

      const balancesOfEther = await Promise.all(balanceOfEtherPromises)

      const balancesOfTokens = await Promise.all(balanceOfTokensPromises)

      const balancesOfTokensWithAddress = accountAddresses.map((account, index) => {
        return {
          account,
          name: this._tokensByAccount[accountKeys[index]].name,
          balancesInfo: balancesOfTokens[index]
        }
      })

      // Check if the account has ETHER below the minimum amount
      balancesOfEther.forEach((balance, index) => {
        if (balance < this._minimumAmountForEther) {
          const account = accountAddresses[index]
          const name = this._tokensByAccount[accountKeys[index]].name
          this._lastWarnNotification = new Date()
          // Notify lack of ether
          this._notifyLackOfEther(balance, account, name)
        }
      })

      balancesOfTokensWithAddress.forEach(({ account, name, balancesInfo }) => {
        // Check if there are tokens below the minimum amount

        const tokenBelowMinimum = balancesInfo.filter(balanceInfo => {
          return balanceInfo.amountInUSD.lessThan(this._minimumAmountInUsdForToken)
        })

        if (tokenBelowMinimum.length > 0) {
          // Notify lack of tokens
          this._notifyLackOfTokens(tokenBelowMinimum, account, name)
        } else {
          logger.debug('Everything is fine for account: %s', account)
        }
      })

      botHasEnoughTokens = true
    } catch (error) {
      this.lastError = new Date()
      botHasEnoughTokens = false
      logger.error({
        msg: 'There was an error checking the balance for the bot: %s',
        params: [ error ],
        error
      })
    }

    return botHasEnoughTokens
  }

  async getInfo () {
    return {
      botAddress: this._botAddress,
      minimumAmountInUsd: this._minimumAmountInUsdForToken,
      minimumAmountInEth: this._minimumAmountForEther * 1e-18,
      tokensByAccount: this._tokensByAccount,
      botFundingSlackChannel: this._botFundingSlackChannel,
      lastCheck: this._lastCheck,
      lastWarnNotification: this._lastWarnNotification,
      lastError: this._lastError,
      lastSlackEtherBalanceNotification: this._lastSlackEtherBalanceNotification,
      lastSlackTokenBalanceNotification: this._lastSlackTokenBalanceNotification
    }
  }

  _notifyLackOfEther (balanceOfEther, account, name) {
    const minimumAmount = this._minimumAmountForEther / 1e18
    const balance = balanceOfEther.div(1e18).valueOf()

    const message = 'The bot account has ETHER balance below ' + minimumAmount

    // Log message
    logger.warn({
      msg: message,
      contextData: {
        extra: {
          balanceOfEther: balance,
          account,
          name
        }
      },
      notify: true
    })

    // Notify to slack
    this._notifyToSlack({
      name: 'Ether Balance',
      lastNotificationVariableName: '_lastSlackEtherBalanceNotification',
      message: {
        attachments: [{
          color: 'danger',
          title: message,
          fields: [
            {
              title: 'Ether balance',
              value: numberUtil.roundDown(balance, 4) + ' ETH',
              short: false
            }, {
              title: 'Bot account',
              value: account,
              short: false
            }, {
              title: 'Affected Bots',
              value: name,
              short: false
            }
          ],
          footer: this.botInfo
        }]
      }
    })
  }

  _notifyLackOfTokens (tokenBelowMinimum, account, name) {
    // Notify which tokens are below the minimum value
    this._lastWarnNotification = new Date()
    const tokenBelowMinimumValue = tokenBelowMinimum.map(balanceInfo => {
      return Object.assign(balanceInfo, {
        amount: balanceInfo.amount.div(1e18).valueOf(),
        amountInUSD: balanceInfo.amountInUSD.valueOf()
      })
    })

    const message = `The bot account has tokens below the ${this._minimumAmountInUsdForToken} USD worth of value`
    const tokenNames = tokenBelowMinimum.map(balanceInfo => balanceInfo.token).join(', ')
    let fields = tokenBelowMinimumValue.map(({ token, amount, amountInUSD }) => ({
      title: token,
      value: numberUtil.roundDown(amount, 4) + ' ' + token + ' ($' + amountInUSD + ')',
      short: false
    }))

    fields = [].concat({
      title: 'Bot account',
      value: account,
      short: false
    }, {
      title: 'Affected Bots',
      value: name,
      short: false
    }, fields)

    // Log message
    logger.warn({
      msg: message + ': ' + tokenNames,
      contextData: {
        extra: {
          account,
          tokenBelowMinimum: tokenBelowMinimumValue
        }
      },
      notify: true
    })

    // Notify to slack
    this._notifyToSlack({
      name: 'Token Balances',
      lastNotificationVariableName: '_lastSlackTokenBalanceNotification',
      message: {
        attachments: [{
          color: 'danger',
          title: message,
          text: 'The tokens below the threshold are:',
          fields,
          footer: this.botInfo
        }]
      }
    })
  }

  async _notifyToSlack ({ name, lastNotificationVariableName, message }) {
    if (this._botFundingSlackChannel && this._slackClient.isEnabled()) {
      const now = new Date()
      const lastNotification = this[lastNotificationVariableName]

      let nextNotification
      if (lastNotification) {
        nextNotification = new Date(
          lastNotification.getTime() +
          MINIMUM_TIME_BETWEEN_SLACK_NOTIFICATIONS
        )
      } else {
        nextNotification = now
      }
      if (nextNotification <= now) {
        logger.info('Notifying "%s" to slack', name)
        message.channel = this._botFundingSlackChannel

        this._slackClient
          .postMessage(message)
          .then(() => {
            this[lastNotificationVariableName] = now
          })
          .catch(error => {
            logger.error({
              msg: 'Error notifing lack of ether to Slack: ' + error.toString(),
              error
            })
          })
      } else {
        logger.info(`The slack notifcation for "%s" was sent too soon. Next \
one will be %s`, name, formatUtil.formatDateFromNow(nextNotification))
      }
    }
  }
}

module.exports = BalanceCheckBot