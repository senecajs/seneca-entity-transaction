"use strict";
/* Copyright © 2021-2022 Richard Rodger, MIT License. */
Object.defineProperty(exports, "__esModule", { value: true });
class TrxApi {
    constructor(args) {
        this.seneca = args.seneca;
        this.strategy = args.strategy;
    }
    async start() {
        var _a;
        // NOTE: The purpose of retrieving pending transactions is as follows. Many db clients
        // implement support for nested transactions. Which means that, by retrieving pending trx
        // clients and passing them to users, the users are able to leverage their db client's
        // management for nested transactions.
        //
        // TODO: This should probably walk the whole delegation chain in search of a pending trx.
        // Not yet sure.
        //
        //const pending_trx = Intern.tryGetPendingTrxOfDelegateOrParentInstance(this.seneca) ?? null
        const pending_trx = (_a = Intern.tryGetTrx(this.seneca)) !== null && _a !== void 0 ? _a : null;
        const ctx = await this.strategy.startTrx(this.seneca, pending_trx);
        let trx = {
            ctx
        };
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
        var _a;
        const trx = (_a = Intern.tryGetTrx(this.seneca)) !== null && _a !== void 0 ? _a : null;
        await this.strategy.commitTrx(this.seneca, trx);
    }
    async rollback() {
        var _a;
        const trx = (_a = Intern.tryGetTrx(this.seneca)) !== null && _a !== void 0 ? _a : null;
        await this.strategy.rollbackTrx(this.seneca, trx);
    }
}
class Intern {
    static tryGetTrx(seneca) {
        var _a, _b, _c;
        return (_c = (_b = (_a = seneca.fixedmeta) === null || _a === void 0 ? void 0 : _a.custom) === null || _b === void 0 ? void 0 : _b.entity_transaction) === null || _c === void 0 ? void 0 : _c.trx;
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
                tryGetTrx: Intern.tryGetTrx
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