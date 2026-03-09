export declare function validateBashCommand(command: string): {
    allowed: true;
} | {
    allowed: false;
    reason: string;
};
