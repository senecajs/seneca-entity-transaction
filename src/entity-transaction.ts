/* Copyright © 2021-2022 Richard Rodger, MIT License. */


type TrxApiConstructorArgs = {
  seneca: any
}

type Trx = {
  handle: any
}

type PluginOpts = {
  startTrx: () => Promise<any>
  commitTrx: (trx: Trx) => Promise<any>
  rollbackTrx: (trx: Trx) => Promise<any>
}


class TrxApi {
  seneca: any
  opts: PluginOpts

  constructor(args: TrxApiConstructorArgs, opts: PluginOpts) {
    this.seneca = args.seneca
    this.opts = Object.assign({}, opts)
  }

  async start() {
    const handle = await this.opts.startTrx.call(this.seneca)

    const trx: Trx = {
      handle
    }

    const seneca_trx = this.seneca.delegate(null, {
      custom: {
	entity_transaction: {
	  trx
	}
      }
    })

    return seneca_trx
  }

  async commit() {
    const trx = tryRetrieveTrxInfo(this.seneca)
    await this.opts.commitTrx.call(this.seneca, trx)
  }

  async rollback() {
    const trx = tryRetrieveTrxInfo(this.seneca)
    await this.opts.rollbackTrx.call(this.seneca, trx)
  }
}


function tryRetrieveTrxInfo(seneca: any): Trx {
  return seneca.custom?.entity_transaction?.transaction
}


function entity_transaction(this: any, opts: PluginOpts) {
  if (typeof opts.startTrx !== 'function') {
    throw new Error('opts.startTrx must be a function')
  }

  if (typeof opts.commitTrx !== 'function') {
    throw new Error('opts.commitTrx must be a function')
  }

  if (typeof opts.rollbackTrx !== 'function') {
    throw new Error('opts.rollbackTrx must be a function')
  }

  this.decorate('trx', function(this: any) {
    return new TrxApi({ seneca: this }, opts)
  })
}


// Default options.
entity_transaction.defaults = {
}


export default entity_transaction

if ('undefined' !== typeof (module)) {
  module.exports = entity_transaction
}
