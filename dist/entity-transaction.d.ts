declare type Trx = {
    ctx: any;
};
interface ITrxStrategy {
    startTrx(seneca: any, pending_trx?: Trx): Promise<any>;
    commitTrx(seneca: any, trx: Trx): Promise<any>;
    rollbackTrx(seneca: any, trx: Trx): Promise<any>;
}
declare class Intern {
    static tryGetTrx(seneca: any): any;
}
declare function entity_transaction(this: any): {
    name: string;
    exports: {
        integration: {
            registerStrategy: (strategy_?: ITrxStrategy) => void;
            tryGetTrx: typeof Intern.tryGetTrx;
        };
    };
};
declare namespace entity_transaction {
    var defaults: {};
}
export default entity_transaction;
