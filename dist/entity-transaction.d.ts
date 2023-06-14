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
interface ITrxStrategy<TCtx> {
    startTrx(seneca: Seneca): Promise<TCtx>;
    commitTrx(seneca: Seneca): Promise<void>;
    rollbackTrx(seneca: Seneca): Promise<void>;
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
