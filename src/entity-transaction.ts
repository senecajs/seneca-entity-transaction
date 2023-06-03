/* Copyright © 2021-2022 Richard Rodger, MIT License. */


type Trx = {
  ctx: any
}

interface TrxStrategy {
  startTrx(seneca: any): Promise<any>
  commitTrx(seneca: any, trx: Trx): Promise<any>
  rollbackTrx(seneca: any, trx: Trx): Promise<any>
}

type TrxApiConstructorArgs = {
  seneca: any
  strategy: TrxStrategy
}


class TrxApi {
  seneca: any
  strategy: TrxStrategy

  constructor(args: TrxApiConstructorArgs) {
    this.seneca = args.seneca
    this.strategy = args.strategy
  }

  async start() {
    const ctx = await this.strategy.startTrx(this.seneca)

    const trx: Trx = {
      ctx
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
    await this.strategy.commitTrx(this.seneca, trx)
  }

  async rollback() {
    const trx = tryRetrieveTrxInfo(this.seneca)
    await this.strategy.rollbackTrx(this.seneca, trx)
  }
}


function tryRetrieveTrxInfo(seneca: any): Trx {
  return seneca.fixedmeta?.custom?.entity_transaction?.trx
}


function entity_transaction(this: any) {
  let strategy: null | TrxStrategy = null


  this.decorate('transaction', function (this: any) {
    if (!strategy) {
      throw new Error('Before you may use the entity-transaction plugin,' +
      	" please use this plugin's registerStrategy export to register" +
      	' your strategy for handling transactions')
    }

    return new TrxApi({ seneca: this, strategy })
  })


  function registerStrategy(strategy_?: TrxStrategy) {
    // User-facing code to help vanilla JS users catch missing overrides.
    //
    if (null == strategy_) {
      throw new Error('Strategy must be an object')
    }

    if (typeof strategy_.startTrx !== 'function') {
      throw new Error('Strategy must implement the startTrx function')
    }

    if (typeof strategy_.commitTrx !== 'function') {
      throw new Error('Strategy must implement the commitTrx function')
    }

    if (typeof strategy_.rollbackTrx !== 'function') {
      throw new Error('Strategy must implement the rollbackTrx function')
    }

    strategy = strategy_
  }


  return {
    name: 'entity-transaction',

    exports: {
      registerStrategy
    }
  }
}


// Default options.
entity_transaction.defaults = {
}


export default entity_transaction

if ('undefined' !== typeof (module)) {
  module.exports = entity_transaction
}
