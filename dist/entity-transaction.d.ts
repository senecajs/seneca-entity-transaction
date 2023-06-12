declare type Trx = {
    ctx: any;
};
interface TrxStrategy {
    startTrx(seneca: any, pending_trx?: Trx): Promise<any>;
    commitTrx(seneca: any, trx: Trx): Promise<any>;
    rollbackTrx(seneca: any, trx: Trx): Promise<any>;
}
declare function entity_transaction(this: any): {
    name: string;
    exports: {
        registerStrategy: (strategy_?: TrxStrategy) => void;
    };
};
declare namespace entity_transaction {
    var defaults: {};
}
export default entity_transaction;
