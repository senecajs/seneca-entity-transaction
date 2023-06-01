"use strict";
/* Copyright © 2021-2022 Richard Rodger, MIT License. */
Object.defineProperty(exports, "__esModule", { value: true });
class TrxApi {
    constructor(args, opts) {
        this.seneca = args.seneca;
        this.opts = Object.assign({}, opts);
    }
    async start() {
        const handle = await this.opts.startTrx.call(this.seneca);
        const trx = {
            handle
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
        const trx = tryRetrieveTrxInfo(this.seneca);
        await this.opts.commitTrx.call(this.seneca, trx);
    }
    async rollback() {
        const trx = tryRetrieveTrxInfo(this.seneca);
        await this.opts.rollbackTrx.call(this.seneca, trx);
    }
}
function tryRetrieveTrxInfo(seneca) {
    var _a, _b;
    return (_b = (_a = seneca.custom) === null || _a === void 0 ? void 0 : _a.entity_transaction) === null || _b === void 0 ? void 0 : _b.transaction;
}
function entity_transaction(opts) {
    if (typeof opts.startTrx !== 'function') {
        throw new Error('opts.startTrx must be a function');
    }
    if (typeof opts.commitTrx !== 'function') {
        throw new Error('opts.commitTrx must be a function');
    }
    if (typeof opts.rollbackTrx !== 'function') {
        throw new Error('opts.rollbackTrx must be a function');
    }
    this.decorate('trx', function () {
        return new TrxApi({ seneca: this }, opts);
    });
}
// Default options.
entity_transaction.defaults = {};
exports.default = entity_transaction;
if ('undefined' !== typeof (module)) {
    module.exports = entity_transaction;
}
//# sourceMappingURL=entity-transaction.js.map