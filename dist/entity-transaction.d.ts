declare type Trx = {
    ctx: any;
};
declare type TrxStrategy = {
    startTrx: () => Promise<any>;
    commitTrx: (trx: Trx) => Promise<any>;
    rollbackTrx: (trx: Trx) => Promise<any>;
};
declare function entity_transaction(this: any): {
    name: string;
    exports: {
        registerStrategy: (strategy_: TrxStrategy | null) => void;
    };
};
declare namespace entity_transaction {
    var defaults: {};
}
export default entity_transaction;
