declare type GatewayResult = {
    out: any | {
        meta$: any;
        error$: {
            name: string;
            code?: string;
            message?: string;
            details?: any;
        };
    };
    error: boolean;
    meta?: any;
    gateway$?: Record<string, any>;
};
declare type GatewayOptions = {
    allow: any;
    custom: any;
    fixed: any;
    error: {
        message: boolean;
        details: boolean;
    };
    debug: boolean;
};
declare function gateway(this: any, options: GatewayOptions): {
    exports: {
        handler: (json: any, ctx: any) => Promise<unknown>;
        parseJSON: (data: any) => any;
    };
};
declare namespace gateway {
    var defaults: {
        allow: import("gubu").Node & {
            [name: string]: any;
        };
        custom: import("gubu").Node & {
            [name: string]: any;
        };
        fixed: import("gubu").Node & {
            [name: string]: any;
        };
        error: {
            message: boolean;
            details: boolean;
        };
        debug: boolean;
    };
}
export type { GatewayOptions, GatewayResult, };
export default gateway;
