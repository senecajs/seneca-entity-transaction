/* Copyright © 2021-2022 Richard Rodger, MIT License. */

declare class Seneca {
  decorate<TDecorator>(name: string, value: TDecorator): void
  delegate<TFixedArgs, TFixedMeta>(fixedargs: TFixedArgs, fixedmeta: TFixedMeta): Seneca

  fixedmeta?: {
    custom?: {
      entity_transaction?: {
	trx: Trx<any>
      }
    }
  }
}

type Trx<TCtx> = {
  ctx: TCtx
}

type Option<T> =
  | null
  | { value: T }


type startTrxOptions = {} // reserved for future use
type commitTrxOptions = {} // reserved for future use
type rollbackTrxOptions = {} // reserved for future use

interface ITrxStrategy<TCtx> {
  startTrx(seneca: Seneca, opts?: startTrxOptions): Promise<TCtx>
  commitTrx(seneca: Seneca, opts?: commitTrxOptions): Promise<void>
  rollbackTrx(seneca: Seneca, opts?: rollbackTrxOptions): Promise<void>
}

type TrxApiConstructorArgs<TCtx> = {
  seneca: Seneca
  strategy: ITrxStrategy<TCtx>
}


class TrxApi<TCtx> {
  seneca: Seneca
  strategy: ITrxStrategy<TCtx>

  constructor(args: TrxApiConstructorArgs<TCtx>) {
    this.seneca = args.seneca
    this.strategy = args.strategy
  }

  async start(): Promise<Seneca> {
    // QUESTION: If a transaction already exists, why do we invoke the startTrx
    // hook anyway?
    //
    // ANSWER: If a transaction already exists, we __must__ nonetheless invoke
    // the startTrx hook because:
    // - client's strategy may utilize a db client which supports nested transactions
    // - client's strategy may implement custom logic to handle nested transactions

    const ctx: TCtx = await this.strategy.startTrx(this.seneca)

    // QUESTION: Why not store the context directly, i.e. why wrap it in
    // a Trx object?
    //
    // ANSWER: Further down the line we may want to add additional state to
    // transactions. Wrapping user transaction contexts in an object will make
    // it easy for us to add additional state in the future, without breaking
    // existing seneca-store integrations or users.
    //
    const trx: Trx<TCtx> = {
      ctx
    }

    // QUESTION: If a transaction already exists, can't we do without creating
    // a Seneca delegate, and just return the current Seneca instance instead?
    //
    // ANSWER: No. We __must__ return a delegate here, because some db clients
    // either implement an adapter to simulate nested transactions (e.g. knex
    // with the mysql2 driver) or support nested transactions directly.
    // Therefore, a nested transaction's handle, too, must be stored.
    //
    // In other words, nested transactions, if a seneca-store's db supports
    // them, have their own state, which, too, must be stored.
    //
    const seneca_trx: Seneca = this.seneca.delegate(null, {
      custom: {
	entity_transaction: {
	  trx
	}
      }
    })

    return seneca_trx
  }

  async commit() {
    await this.strategy.commitTrx(this.seneca)

    // QUESTION: Why can't we implement support for nested transactions in this
    // plugin, instead of leaving it up to db-store plugins and their strategies
    // to implement them?
    //
    // ANSWER: TL;DR, here's an example. Assume a db-store plugin uses a db
    // whose driver supports nested transactions.
    //
    // Now, how would you handle the start-start-rollback-commit scenario
    // without having the intimate knowledge of the db state, that only
    // the db-store plugin's db client has? Take a look:
    // ```
    // const senecatrx = await this.transaction().start()
    // await senecatrx.entity('user').data$(bob).save$()
    //
    // const nestedtrx = await senecatrx.transaction().start()
    // await nestedtrx.entity('user').data$(alice).save$()
    // await nestedtrx.transaction().rollback()
    //
    // await senecatrx.transaction().commit()
    // ```
    //
    // In the code snippet above, the expected result is for Bob to be saved
    // to the db, but not Alice. The db client does that book-keeping for us
    // for free.
    //
    // We cannot rely on seneca-entity to keep track of operations to manage
    // nested transactions either, because:
    //
    // - some seneca stores support .native() which exposes direct access
    //   to the store's db client to users, bypassing seneca-entity completely
    //
    // - some users have hybrid setups where both seneca-entity and their
    //   own code access a single db


    // QUESTION: Why are we are not null-ifying completed transactions?
    //
    // ANSWER: We are not null-ifying completed transactions because we want
    // to leave it up to a client's strategy to handle reuse of trx instances.
    //
    // This plugin is just a thin overlay between db-store plugins and Seneca
    // users.
  }

  async rollback() {
    await this.strategy.rollbackTrx(this.seneca)
  }

  getContext(): Option<TCtx> {
    return Intern.getContext(this.seneca)

    // QUESTION: What's up with the weird Option<TCtx> type - can't you just
    // return the context?
    //
    // ANSWER: If getContext() returned null or the context, users would have
    // no way of telling whether null meant there was no pending transaction,
    // or whether the context itself was set to null.


    // QUESTION: Why not return the Trx object instead of just the context?
    //
    // ANSWER: Further down the line we may want to add additional state to
    // transactions. We do not want users to depend on that state.
    //
    // If we decide to expose that state to users, we may easily extend this
    // API (e.g. getTransaction) without breaking existing seneca-store
    // integrations or users.
  }
}


class Intern {
  static getTrx<TCtx>(seneca: Seneca): Trx<TCtx> | void {
    return seneca.fixedmeta?.custom?.entity_transaction?.trx
  }

  static getContext<TCtx>(seneca: Seneca): Option<TCtx> {
    const trx = Intern.getTrx(seneca)

    if (trx) {
      const ctx = trx.ctx as TCtx
      return { value: ctx }
    }

    return null
  }
}


function entity_transaction(this: Seneca) {
  let strategy: null | ITrxStrategy<any> = null


  this.decorate('transaction', function (this: Seneca) {
    if (!strategy) {
      throw new Error('Before you may use the entity-transaction plugin,' +
      	" please use this plugin's registerStrategy export to register" +
      	' your strategy for handling transactions')
    }

    return new TrxApi({ seneca: this, strategy })
  })


  function registerStrategy<TCtx>(strategy_?: ITrxStrategy<TCtx>) {
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


  return {
    name: 'entity-transaction',

    exports: {
      integration: {
	registerStrategy,
	getContext: Intern.getContext
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
