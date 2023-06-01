type Trx = {
    handle: any;
};
type PluginOpts = {
    startTrx: () => Promise<any>;
    commitTrx: (trx: Trx) => Promise<any>;
    rollbackTrx: (trx: Trx) => Promise<any>;
};
declare function entity_transaction(this: any, opts: PluginOpts): void;
declare namespace entity_transaction {
    var defaults: {};
}
export default entity_transaction;
