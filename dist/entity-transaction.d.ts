declare class Seneca {
    decorate<TDecorator>(name: string, value: TDecorator): void;
    delegate<TFixedArgs, TFixedMeta>(fixedargs: TFixedArgs, fixedmeta: TFixedMeta): Seneca;
    fixedmeta?: {
        custom?: {
            entity_transaction?: {
                trx: Trx<any>;
            };
        };
    };
}
declare type Trx<TCtx> = {
    ctx: TCtx;
};
declare type Option<T> = null | {
    value: T;
};
declare type startTrxOptions = {};
declare type commitTrxOptions = {};
declare type rollbackTrxOptions = {};
interface ITrxStrategy<TCtx> {
    startTrx(seneca: Seneca, opts?: startTrxOptions): Promise<TCtx>;
    commitTrx(seneca: Seneca, opts?: commitTrxOptions): Promise<void>;
    rollbackTrx(seneca: Seneca, opts?: rollbackTrxOptions): Promise<void>;
}
declare class Intern {
    static getTrx<TCtx>(seneca: Seneca): Trx<TCtx> | void;
    static getContext<TCtx>(seneca: Seneca): Option<TCtx>;
}
declare function entity_transaction(this: Seneca): {
    name: string;
    exports: {
        integration: {
            registerStrategy: <TCtx>(strategy_?: ITrxStrategy<TCtx> | undefined) => void;
            getContext: typeof Intern.getContext;
        };
    };
};
declare namespace entity_transaction {
    var defaults: {};
}
export default entity_transaction;
