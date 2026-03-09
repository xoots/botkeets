import pino from 'pino';
export declare const logger: pino.Logger<never, boolean>;
export declare function generateTraceId(): string;
export declare function childLogger(traceId: string): pino.Logger<never, boolean>;
//# sourceMappingURL=logger.d.ts.map