// src/types.ts
export interface TransactionCriteria {
    recipientAddress: string;
    senderAddress: string;
    expectedAmount: string;
    maxBlocksToWait: number;
}
