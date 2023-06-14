"use strict";
/* Copyright © 2021-2022 Richard Rodger, MIT License. */
Object.defineProperty(exports, "__esModule", { value: true });
class TrxApi {
    constructor(args) {
        this.seneca = args.seneca;
        this.strategy = args.strategy;
    }
    async start() {
        /*
        // NOTE: The purpose of retrieving pending transactions is as follows. Many db clients
        // implement support for nested transactions. Which means that, by retrieving pending trx
        // clients and passing them to users, the users are able to leverage their db client's
        // management for nested transactions.
        //
        // TODO: This should probably walk the whole delegation chain in search of a pending trx.
        // Not yet sure.
        //
        //const pending_trx = Intern.tryGetPendingTrxOfDelegateOrParentInstance(this.seneca) ?? null
        */
        // NOTE: If a transaction already exists, we __must__ nonetheless invoke the startTrx
        // hook because:
        // - client's strategy may utilize a db client which supports nested transactions
        // - client's strategy may implement custom logic to handle nested transactions
        const ctx = await this.strategy.startTrx(this.seneca);
        const trx = {
            ctx
        };
        // NOTE: We __must__ return a delegate here, because some db clients either
        // implement an adapter to simulate nested transactions (e.g. knex with
        // the mysql2 driver) or support nested transactions directly. Therefore,
        // a nested transaction's handle, too, must be stored.
        //
        const seneca_trx = this.seneca.delegate(null, {
            custom: {
                entity_transaction: {
                    trx
                }
            }
        });
        return seneca_trx;
    }
    async commit() {
        // QUESTION: Why can't we implement support for nested transactions in this
        // plugin, instead of leaving it up to db-store plugins and their strategies
        // to implement them?
        //
        //
        // ANSWER: TL;DR, here's an example. Assume a db-store plugin uses a db
        // whose driver supports nested transactions.
        //
        // Now, how would you handle the start-start-rollback-commit scenario without
        // having the intimate knowledge of the db state, that only the db-store
        // plugin's db client has? Take a look:
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
        await this.strategy.commitTrx(this.seneca);
        // QUESTION: Why are we are not null-ifying completed transactions?
        //
        // ANSWER: We are not null-ifying completed transactions because we want to leave
        // it up to a client's strategy to handle reuse of trx instances. This plugin is
        // just a thin overlay between db-store plugins and Seneca users.
    }
    async rollback() {
        await this.strategy.rollbackTrx(this.seneca);
    }
    getContext() {
        return Intern.getContext(this.seneca);
    }
}
class Intern {
    static getTrx(seneca) {
        var _a, _b, _c;
        return (_c = (_b = (_a = seneca.fixedmeta) === null || _a === void 0 ? void 0 : _a.custom) === null || _b === void 0 ? void 0 : _b.entity_transaction) === null || _c === void 0 ? void 0 : _c.trx;
    }
    static getContext(seneca) {
        const trx = Intern.getTrx(seneca);
        if (trx) {
            const ctx = trx.ctx;
            return { value: ctx };
        }
        return null;
    }
}
function entity_transaction() {
    let strategy = null;
    this.decorate('transaction', function () {
        if (!strategy) {
            throw new Error('Before you may use the entity-transaction plugin,' +
                " please use this plugin's registerStrategy export to register" +
                ' your strategy for handling transactions');
        }
        return new TrxApi({ seneca: this, strategy });
    });
    function registerStrategy(strategy_) {
        // NOTE: This is user-facing code to help vanilla JS users catch missing overrides.
        //
        if (null == strategy_) {
            throw new Error('Strategy must be an object');
        }
        if (typeof strategy_.startTrx !== 'function') {
            throw new Error('Strategy must implement the startTrx function');
        }
        if (typeof strategy_.commitTrx !== 'function') {
            throw new Error('Strategy must implement the commitTrx function');
        }
        if (typeof strategy_.rollbackTrx !== 'function') {
            throw new Error('Strategy must implement the rollbackTrx function');
        }
        strategy = strategy_;
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
                getContext: Intern.getContext
            }
        }
    };
}
// Default options.
entity_transaction.defaults = {};
exports.default = entity_transaction;
if ('undefined' !== typeof (module)) {
    module.exports = entity_transaction;
}
//# sourceMappingURL=entity-transaction.js.map