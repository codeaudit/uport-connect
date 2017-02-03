import TopicFactory from './topicFactory'
import { Credentials } from 'uport'
import MobileDetect from 'mobile-detect'
import ContractFactory from './contract'
import UportWeb3 from './uportWeb3'
import { openQr, closeQr } from './util/qrdisplay'
const INFURA_ROPSTEN = 'https://ropsten.infura.io'

// TODO Add simple QR wrapper for the orginal default flow, just means wrapping open/close functionality
// TODO add cancel back in, should be really simple now
// TODO extend this uport to uport with web3 so we can eventually have sepearte distributions.

function mobileUriHandler (uri) {
  window.location.assign(uri)
}

function isMobile () {
  if (typeof navigator !== 'undefined') {
    return !!(new MobileDetect(navigator.userAgent).mobile())
  } else return false
}
/**
 * This class is the main entry point for interaction with uport.
 */
class Connect {

  /**
   * Creates a new uport object.
   *
   * @memberof    Uport
   * @method      constructor
   * @param       {String}            appName                the name of your app
   * @param       {Object}            opts                    optional parameters
   * @param       {String}            opts.clientId           a uport id for your application
   * @param       {Object}            opts.credentials        configured Credentials object from http://github.com/uport-project/uport-js object. Configure this is you need to create signed requests
   * @param       {String}            opts.rpcUrl             a JSON rpc url (defaults to https://ropsten.infura.io)
   * @param       {String}            opts.infuraApiKey       Infura API Key (register here http://infura.io/register.html)
   * @param       {Function}          opts.topicFactory       A function creating a topic
   * @param       {Function}          opts.uriHandler        Function to present QR code or other UX to approve request
   * @param       {Function}          opts.mobileUriHandler  Function to request in mobile browsers
   * @param       {Function}          opts.closeUriHandler       Function to hide UX created with uriHandler after request is done
   * @return      {Object}            self
   */

  //  TODO do we need registry settings
  constructor (appName, opts = {}) {
    this.appName = appName || 'uport-connect-app'
    this.infuraApiKey = opts.infuraApiKey || this.appName.replace(/\W+/g, '-')
    this.clientId = opts.clientId

    this.rpcUrl = opts.rpcUrl || (INFURA_ROPSTEN + '/' + this.infuraApiKey)
    this.isOnMobile = opts.isMobile || isMobile()
    this.topicFactory = opts.topicFactory || TopicFactory(this.isOnMobile)
    this.uriHandler = opts.uriHandler || openQr
    this.mobileUriHandler = opts.mobileUriHandler || mobileUriHandler
    this.closeUriHandler = opts.closeUriHandler || (this.uriHandler === openQr ? closeQr : undefined)
    this.credentials = opts.credentials || new Credentials()
    this.canSign = !!this.credentials.settings.signer
  }

  getWeb3 () {
    return UportWeb3({
      requestAddress: this.requestAddress.bind(this),
      sendTransaction: this.sendTransaction.bind(this),
      rpcUrl: this.rpcUrl
    })
  }

  requestCredentials (request = {}, uriHandler = null) {
    const self = this
    const topic = this.topicFactory('access_token')
    const uri = paramsToUri(this.addAppParameters({to: 'me'}, topic.url))
    return this.request({uri, topic, uriHandler}).then(self.credentials.receive)
  }

  requestAddress (uriHandler = null) {
    return this.requestCredentials({}, uriHandler).then((profile) => profile.address)
  }

  request ({uri, topic, uriHandler}) {
    this.isOnMobile
      ? this.mobileUriHandler(uri)
      : (uriHandler || this.uriHandler)(uri)
    if (this.closeUriHandler) {
      return new Promise((resolve, reject) => {
        topic.then(res => {
          this.closeUriHandler()
          resolve(res)
        }, error => {
          this.closeUriHandler()
          reject(error)
        })
      })
    } else return topic
  }

  // TODO support contract.new (maybe?)
  contract (abi) {
    return new ContractFactory(abi, this.txObjectHandler.bind(this))
  }

  sendTransaction (txobj, uriHandler = null) {
    return this.txObjectHandler(txobj, uriHandler)
  }

  addAppParameters (txObject, callbackUrl) {
    const appTxObject = Object.assign({}, txObject)
    if (callbackUrl) {
      appTxObject.callback_url = callbackUrl
    }
    if (this.appName) {
      appTxObject.label = this.appName
    }
    if (this.clientId) {
      appTxObject.client_id = this.clientId
    }
    return appTxObject
  }

  txObjectHandler (methodTxObject, uriHandler = null) {
    const topic = this.topicFactory('tx')
    let uri = paramsToUri(this.addAppParameters(methodTxObject, topic.url))
    return this.request({uri, topic, uriHandler})
  }
}

const paramsToUri = (txParams) => {
  if (!txParams.to) {
    throw new Error('Contract creation is not supported by uportProvider')
  }
  let uri = `me.uport:${txParams.to}`
  const params = []
  if (txParams.value) {
    params.push(['value', parseInt(txParams.value, 16)])
  }
  if (txParams.function) {
    params.push(['function', txParams.function])
  } else if (txParams.data) {
    params.push(['bytecode', txParams.data])
  }
  ['label', 'callback_url', 'client_id'].map(param => {
    if (txParams[param]) {
      params.push([param, txParams[param]])
    }
  })
  return `${uri}?${params.map(kv => `${kv[0]}=${encodeURIComponent(kv[1])}`).join('&')}`
}

export default Connect
