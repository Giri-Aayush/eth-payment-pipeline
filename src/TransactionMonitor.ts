// src/TransactionMonitor.ts
import { ethers } from 'ethers';
import { TransactionCriteria } from './types';
import { config } from './config';

// Define possible transaction states for better tracking
enum TransactionState {
    WAITING = 'WAITING',
    FOUND_INCORRECT_AMOUNT = 'FOUND_INCORRECT_AMOUNT',
    FOUND_CORRECT_AMOUNT = 'FOUND_CORRECT_AMOUNT',
    TIMEOUT = 'TIMEOUT'
}

export class TransactionMonitor {
    private provider: ethers.Provider;
    private startBlockNumber: number;
    private blocksChecked: number;
    private isDestroyed: boolean;
    private foundTransactions: Array<{hash: string, amount: string}>;

    constructor(rpcUrl: string) {
        console.log('🚀 Initializing Transaction Monitor...');
        this.provider = new ethers.JsonRpcProvider(rpcUrl);
        this.startBlockNumber = 0;
        this.blocksChecked = 0;
        this.isDestroyed = false;
        this.foundTransactions = [];
    }

    async monitorTransaction(senderAddress: string): Promise<TransactionState> {
        console.log('\n📝 Validating inputs...');
        if (!ethers.isAddress(senderAddress)) {
            throw new Error('Invalid sender address format');
        }

        const criteria: TransactionCriteria = {
            recipientAddress: config.recipientAddress,
            senderAddress: senderAddress,
            expectedAmount: config.expectedAmount,
            maxBlocksToWait: config.maxBlocksToWait
        };

        const expectedAmountWei = ethers.parseEther(criteria.expectedAmount);
        console.log(`💰 Expected amount in Wei: ${expectedAmountWei.toString()}`);
        
        const network = await this.provider.getNetwork();
        console.log(`\n🌐 Connected to network: ${network.name}`);
        console.log(`🔗 Chain ID: ${network.chainId}`);
        
        this.startBlockNumber = await this.provider.getBlockNumber();
        console.log('\n🔍 Starting transaction monitoring:');
        console.log(`   - Starting from block: ${this.startBlockNumber}`);
        console.log(`   - Expected amount: ${criteria.expectedAmount} ETH`);
        console.log(`   - From address: ${criteria.senderAddress}`);
        console.log(`   - To address: ${criteria.recipientAddress}`);
        console.log(`   - Will monitor for ${criteria.maxBlocksToWait} blocks`);

        return new Promise((resolve, reject) => {
            let isResolved = false;

            const blockHandler = async (blockNumber: number) => {
                if (this.isDestroyed || isResolved) return;

                try {
                    const block = await this.provider.getBlock(blockNumber);
                    if (!block) return;

                    console.log(`\n📦 Checking block ${blockNumber} (${this.blocksChecked + 1}/${criteria.maxBlocksToWait})`);
                    this.blocksChecked++;

                    if (this.blocksChecked > criteria.maxBlocksToWait) {
                        console.log('\n⏰ Maximum block limit reached!');
                        if (this.foundTransactions.length > 0) {
                            console.log('\n💡 Found transactions with incorrect amounts:');
                            this.foundTransactions.forEach(tx => {
                                console.log(`   Hash: ${tx.hash}`);
                                console.log(`   Amount: ${tx.amount} ETH`);
                            });
                            cleanup();
                            resolve(TransactionState.FOUND_INCORRECT_AMOUNT);
                        } else {
                            console.log('\n❌ No transactions found from sender.');
                            cleanup();
                            resolve(TransactionState.TIMEOUT);
                        }
                        return;
                    }

                    if (block.transactions) {
                        console.log(`   Found ${block.transactions.length} transactions in this block`);
                        
                        for (const txHash of block.transactions) {
                            if (this.isDestroyed || isResolved) return;

                            try {
                                const tx = await this.provider.getTransaction(txHash);
                                if (!tx) continue;

                                // Check if this transaction is from our sender
                                if (tx.from.toLowerCase() === criteria.senderAddress.toLowerCase() &&
                                    tx.to?.toLowerCase() === criteria.recipientAddress.toLowerCase()) {
                                    
                                    const amountInEth = ethers.formatEther(tx.value);
                                    console.log('\n🔎 Found relevant transaction:');
                                    console.log(`   Hash: ${tx.hash}`);
                                    console.log(`   Amount: ${amountInEth} ETH`);

                                    if (tx.value < expectedAmountWei) {
                                        console.log('   ⚠️ Amount is less than expected!');
                                        this.foundTransactions.push({
                                            hash: tx.hash,
                                            amount: amountInEth
                                        });
                                        continue;
                                    }

                                    if (tx.value >= expectedAmountWei) {
                                        console.log('\n✨ Transaction matches criteria! Waiting for confirmations...');
                                        try {
                                            const receipt = await tx.wait(config.confirmations);
                                            if (receipt) {
                                                console.log('\n🎉 Transaction confirmed!');
                                                console.log(`   Final block number: ${receipt.blockNumber}`);
                                                console.log(`   Gas used: ${receipt.gasUsed.toString()}`);
                                                console.log(`   Transaction hash: ${tx.hash}`);
                                                cleanup();
                                                isResolved = true;
                                                resolve(TransactionState.FOUND_CORRECT_AMOUNT);
                                                return;
                                            }
                                        } catch (waitError) {
                                            console.error('\n⚠️ Error waiting for confirmation:', waitError);
                                        }
                                    }
                                }
                            } catch (txError) {
                                if (!this.isDestroyed) {
                                    console.error('   ⚠️ Error processing transaction:', txError);
                                }
                            }
                        }
                    }
                } catch (error) {
                    if (!this.isDestroyed) {
                        console.error('\n❌ Error processing block:', error);
                        cleanup();
                        reject(error);
                    }
                }
            };

            const cleanup = () => {
                if (!this.isDestroyed) {
                    this.provider.removeListener('block', blockHandler);
                }
            };

            this.provider.on('block', blockHandler);

            // Set a timeout for the entire operation
            const timeout = criteria.maxBlocksToWait * 15 * 1000; // 15 seconds per block
            setTimeout(() => {
                if (!isResolved) {
                    console.log('\n⏰ Operation timed out!');
                    cleanup();
                    resolve(TransactionState.TIMEOUT);
                }
            }, timeout);
        });
    }

    async destroy(): Promise<void> {
        console.log('\n🧹 Cleaning up monitor resources...');
        this.isDestroyed = true;
        await new Promise(resolve => setTimeout(resolve, 100));
        this.provider.removeAllListeners();
        if (typeof this.provider.destroy === 'function') {
            await this.provider.destroy();
        }
        console.log('✅ Cleanup completed');
    }
}