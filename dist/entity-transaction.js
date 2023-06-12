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
        const pending_trx = (_a = Intern.tryGetPendingTrx(this.seneca)) !== null && _a !== void 0 ? _a : null;
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
        const trx = (_a = Intern.getPluginMetaStorage(this.seneca)) === null || _a === void 0 ? void 0 : _a.trx;
        if (!trx) {
            return;
        }
        await this.strategy.commitTrx(this.seneca, trx);
        // NOTE: We indicate that a trx has been completed by setting it to null.
        // Later, start() will rely on this when handling potential pending parent trxs.
        //
        Intern.getPluginMetaStorage(this.seneca).trx = null;
    }
    async rollback() {
        var _a;
        const trx = (_a = Intern.getPluginMetaStorage(this.seneca)) === null || _a === void 0 ? void 0 : _a.trx;
        if (!trx) {
            return;
        }
        await this.strategy.rollbackTrx(this.seneca, trx);
        // NOTE: We indicate that a trx has been completed by setting it to null.
        // Later, start() will rely on this when handling potential pending parent trxs.
        //
        Intern.getPluginMetaStorage(this.seneca).trx = null;
    }
}
class Intern {
    static getParentOfDelegate(seneca) {
        return Object.getPrototypeOf(seneca);
    }
    static getPluginMetaStorage(seneca) {
        var _a, _b, _c;
        return (_c = (_b = (_a = seneca.fixedmeta) === null || _a === void 0 ? void 0 : _a.custom) === null || _b === void 0 ? void 0 : _b.entity_transaction) !== null && _c !== void 0 ? _c : null;
    }
    static tryGetPendingTrx(seneca) {
        var _a, _b, _c, _d, _e;
        // NOTE: If current_pending is not null, then it means the user is trying to start
        // a nested transaction, e.g.:
        // ```
        //	const senecatrx = await this.transaction().start()
        //	await senecatrx.transaction().start()
        // ```
        //
        const current_pending = (_b = (_a = Intern.getPluginMetaStorage(seneca)) === null || _a === void 0 ? void 0 : _a.trx) !== null && _b !== void 0 ? _b : null;
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
        const parent_pending = (_d = (_c = Intern.getPluginMetaStorage(Intern.getParentOfDelegate(seneca))) === null || _c === void 0 ? void 0 : _c.trx) !== null && _d !== void 0 ? _d : null;
        return (_e = current_pending !== null && current_pending !== void 0 ? current_pending : parent_pending) !== null && _e !== void 0 ? _e : null;
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
    return {
        name: 'entity-transaction',
        exports: {
            registerStrategy
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