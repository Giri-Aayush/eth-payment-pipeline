// src/index.ts
import { config } from './config';
import { TransactionMonitor } from './TransactionMonitor';
import { ethers } from 'ethers';

async function main() {
    console.log('\n🔄 Starting payment verification system...');
    const monitor = new TransactionMonitor(config.rpcUrl);
    let cleanupCalled = false;

    const cleanup = async () => {
        if (!cleanupCalled) {
            cleanupCalled = true;
            await monitor.destroy();
        }
    };

    // Handle various termination scenarios
    process.on('SIGINT', async () => {
        console.log('\n\n🛑 Received termination signal');
        await cleanup();
        process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
        console.log('\n\n🛑 Received system termination signal');
        await cleanup();
        process.exit(0);
    });

    const senderAddress = process.argv[2];
    if (!senderAddress || !ethers.isAddress(senderAddress)) {
        console.error('\n❌ Invalid sender address provided');
        console.error('Usage: npx ts-node src/index.ts <sender-address>');
        process.exit(1);
    }

    try {
        const result = await monitor.monitorTransaction(senderAddress);
        
        console.log('\n📊 Final Result:');
        switch (result) {
            case 'FOUND_CORRECT_AMOUNT':
                console.log('✅ Thank you! Payment has been confirmed successfully.');
                console.log(`   Expected amount of ${config.expectedAmount} ETH or more has been received.`);
                break;
            
            case 'FOUND_INCORRECT_AMOUNT':
                console.log('⚠️ Payment(s) detected but with incorrect amount!');
                console.log(`   Expected: ${config.expectedAmount} ETH`);
                console.log('   Please check the transaction details above.');
                break;
            
            case 'TIMEOUT':
                console.log('⏰ Session timeout!');
                console.log('   No matching transaction was found within the monitoring period.');
                console.log('   Please retry the payment or contact support if you believe this is an error.');
                break;
            
            default:
                console.log('❓ Unexpected monitoring result');
                break;
        }
    } catch (error) {
        console.error('\n❌ Fatal error while monitoring transaction:', error);
    } finally {
        await cleanup();
    }
}

if (require.main === module) {
    main().catch((error) => {
        console.error('\n💥 Fatal error:', error);
        process.exit(1);
    });
}