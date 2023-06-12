/* Copyright © 2021-2022 Richard Rodger, MIT License. */


type Trx = {
  ctx: any
}

interface TrxStrategy {
  startTrx(seneca: any, pending_trx?: Trx): Promise<any>
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
    // NOTE: The purpose of retrieving pending transactions is as follows. Many db clients
    // implement support for nested transactions. Which means that, by retrieving pending trx
    // clients and passing them to users, the users are able to leverage their db client's
    // management for nested transactions.
    //
    // TODO: This should probably walk the whole delegation chain in search of a pending trx.
    // Not yet sure.
    //
    //const pending_trx = Intern.tryGetPendingTrxOfDelegateOrParentInstance(this.seneca) ?? null
    const pending_trx = Intern.tryGetTrx(this.seneca) ?? null
    const ctx = await this.strategy.startTrx(this.seneca, pending_trx)

    let trx: Trx = {
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
    const trx = Intern.tryGetTrx(this.seneca)

    if (!trx) {
      throw new Error('There is no transaction to commit, - did you forget to start one?')
    }

    await this.strategy.commitTrx(this.seneca, trx)
  }

  async rollback() {
    const trx = Intern.tryGetTrx(this.seneca)

    if (!trx) {
      throw new Error('There is no transaction to rollback, - did you forget to start one?')
    }

    await this.strategy.rollbackTrx(this.seneca, trx)
  }
}


class Intern {
  static tryGetTrx(seneca: any) {
    return seneca.fixedmeta?.custom?.entity_transaction?.trx
  }

  /*
  static getPluginMetaStorage(seneca: any) {
    return seneca.fixedmeta?.custom?.entity_transaction ?? null
  }

  static getParentOfDelegate(seneca: any) {
    return Object.getPrototypeOf(seneca)
  }

  static tryGetPendingTrxOfDelegateOrParentInstance(seneca: any) {
    // NOTE: If current_pending is not null, then it means the user is trying to start
    // a nested transaction, e.g.:
    // ```
    //	const senecatrx = await this.transaction().start()
    //	await senecatrx.transaction().start()
    // ```
    //
    const current_pending = Intern.getPluginMetaStorage(seneca)?.trx ?? null

    // NOTE: If parent_pending is not null, then it means the user is trying to reuse
    // a nested transaction, e.g.:
    // ```
    //	let senecatrx
    //
    //	senecatrx = await this.transaction().start()
    //	await senecatrx.transaction().commit()
    //
    //	senecatrx = await senecatrx.transaction().start()
    // ```
    //
    const parent_pending = Intern.getPluginMetaStorage(Intern.getParentOfDelegate(seneca))?.trx ?? null

    return current_pending ?? parent_pending ?? null
  }
  */
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
    // NOTE: This is user-facing code to help vanilla JS users catch missing overrides.
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

  /*
  function tryGetPendingTrx(seneca: any) {
    // TODO: Test this.
    //
    // TODO: QUESTION: Is it OK we are returning parent trx? E.g.:
    // ```
    //   const senecatrx = await this.transaction().start()
    //
    //   const nestedtrx = await senecatrx.transaction().start()
    //   await nestedtrx.entity('users').data$(alice).save$() // uses nestedtrx trx
    //   await nestedtrx.transaction().commit()
    //
    //   await nestedtrx.entity('users').data$(bob).save$() // uses senecatrx trx
    //
    //   await senecatrx.transaction().commit()
    // ```
    // See what knex does in a similar situation (it probably throws an error)
    //
    return Intern.tryGetPendingTrxOfDelegateOrParentInstance(this.seneca)?.trx ?? null
  }
  */


  return {
    name: 'entity-transaction',

    exports: {
      integration: {
	registerStrategy,
	tryGetTrx: Intern.tryGetTrx
      }
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
