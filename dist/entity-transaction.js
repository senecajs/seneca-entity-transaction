"use strict";
/* Copyright © 2021-2022 Richard Rodger, MIT License. */
Object.defineProperty(exports, "__esModule", { value: true });
class TrxApi {
    constructor(args) {
        this.seneca = args.seneca;
        this.strategy = args.strategy;
    }
    async start() {
        var _a, _b;
        const parent_trx = (_b = (_a = getPluginMetaStorage(this.seneca)) === null || _a === void 0 ? void 0 : _a.trx) !== null && _b !== void 0 ? _b : null;
        const ctx = await this.strategy.startTrx(this.seneca, parent_trx);
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
        const trx = (_a = getPluginMetaStorage(this.seneca)) === null || _a === void 0 ? void 0 : _a.trx;
        if (!trx) {
            return;
        }
        await this.strategy.commitTrx(this.seneca, trx);
        getPluginMetaStorage(this.seneca).trx = null;
    }
    async rollback() {
        var _a;
        const trx = (_a = getPluginMetaStorage(this.seneca)) === null || _a === void 0 ? void 0 : _a.trx;
        if (!trx) {
            return;
        }
        await this.strategy.rollbackTrx(this.seneca, trx);
        getPluginMetaStorage(this.seneca).trx = null;
    }
}
function getPluginMetaStorage(seneca) {
    var _a, _b, _c;
    return (_c = (_b = (_a = seneca.fixedmeta) === null || _a === void 0 ? void 0 : _a.custom) === null || _b === void 0 ? void 0 : _b.entity_transaction) !== null && _c !== void 0 ? _c : null;
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